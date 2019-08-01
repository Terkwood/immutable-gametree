const Draft = require('./Draft')

class GameTree {
    constructor({getId = null, merger = null, root = null} = {}) {
        this.getId = getId || (() => {
            let id = 0
            return () => id++
        })()

        this.merger = merger || (() => null)

        if (root == null) {
            root = {
                id: this.getId(),
                data: {},
                parentId: null,
                children: []
            }
        } else {
            if (root.id == null) root.id = this.getId()
            if (root.data == null) root.data = {}
            if (root.parentId == null) root.parentId = null
            if (root.children == null) root.children = []
        }

        this.root = root
        this._nodeCache = {}
        this._idAliases = {}
        this._heightCache = null
        this._structureHashCache = null
    }

    get(id) {
        let node = null
        if (id == null) return node
        if (id in this._idAliases) return this.get(this._idAliases[id])

        if (id in this._nodeCache) {
            node = this._nodeCache[id]
        } else {
            let inner = node => {
                this._nodeCache[node.id] = node
                if (node.id === id) return node

                for (let child of node.children) {
                    let result = inner(child)
                    if (result != null) return result
                }

                return null
            }

            node = inner(this.root)
        }

        if (node == null) {
            this._nodeCache[id] = null
            return null
        }

        for (let child of node.children) {
            this._nodeCache[child.id] = child
        }

        return node
    }

    *getSequence(id) {
        let node = this.get(id)
        if (node == null) return
        yield node

        if (node.children.length !== 1) return
        yield* this.getSequence(node.children[0].id)
    }

    mutate(mutator) {
        let draft = new Draft(this)

        mutator(draft)
        if (draft.root === this.root) return this

        let tree = new GameTree({
            getId: this.getId,
            merger: this.merger,
            root: draft.root
        })

        if (draft._passOnNodeCache) tree._nodeCache = draft._nodeCache
        tree._idAliases = draft._idAliases
        tree._structureHashCache = draft._structureHashCache
        tree._heightCache = draft._heightCache

        return tree
    }

    navigate(id, step, currents) {
        let node = this.get(id)

        if (node == null) return null
        if (step === 0) return node
        if (step < 0) return this.navigate(node.parentId, step + 1)

        let nextId = currents[node.id] != null ? currents[node.id]
            : node.children.length > 0 ? node.children[0].id
            : null

        if (nextId == null) return null
        return this.navigate(nextId, step - 1, currents)
    }

    *listNodes() {
        function* inner(node) {
            yield node

            for (let child of node.children) {
                yield* inner(child)
            }
        }

        yield* inner(this.root)
    }

    *listNodesHorizontally(startId, step) {
        if (Math.abs(step) !== 1) throw new Error('Invalid value for step, only -1 or 1 allowed')

        let level = this.getLevel(startId)
        let section = [...this.getSection(level)]
        let index = section.findIndex(node => node.id === startId)

        while (section[index] != null) {
            while (0 <= index && index < section.length) {
                yield section[index]
                index += step
            }

            level += step
            section = step > 0 ? [].concat(...section.map(node => node.children)) : [...this.getSection(level)]
            index = step > 0 ? 0 : section.length - 1
        }
    }

    *listNodesVertically(startId, step, currents) {
        if (Math.abs(step) !== 1) throw new Error('Invalid value for step, only -1 or 1 allowed')

        let id = startId
        let node = this.get(id)

        while (node != null) {
            yield node
            node = this.navigate(node.id, step, currents)
        }
    }

    *listCurrentNodes(currents) {
        yield* this.listNodesVertically(this.root.id, 1, currents)
    }

    *listMainNodes() {
        yield* this.listCurrentNodes({})
    }

    getLevel(id) {
        if (id === this.root.id) return 0

        let node = this.get(id)
        if (node == null) return null

        return this.getLevel(node.parentId) + 1
    }

    *getSection(level) {
        if (level < 0) return
        if (level === 0) {
            yield this.root
            return
        }

        for (let parent of this.getSection(level - 1)) {
            yield* parent.children
        }
    }

    getCurrentHeight(currents) {
        let inner = node => {
            if (node == null) return 0

            let child = currents[node.id] == null
                ? node.children[0]
                : node.children.find(child => child.id === currents[node.id])

            return 1 + inner(child)
        }

        return inner(this.root)
    }

    getHeight() {
        if (this._heightCache == null) {
            let inner = node => 1 + Math.max(...node.children.map(inner), 0)
            this._heightCache = inner(this.root)
        }

        return this._heightCache
    }

    getStructureHash() {
        if (this._structureHashCache == null) {
            // Simple hash function adapted from
            // https://github.com/darkskyapp/string-hash

            let hash = (() => {
                let result = 5381

                return str => {
                    for (let i = 0; i < str.length; i++) {
                        result = (result * 33) ^ str.charCodeAt(i)
                    }

                    return result
                }
            })()

            let inner = node => {
                hash('[' + JSON.stringify(node.id) + ',')
                node.children.forEach(inner)
                return hash(']')
            }

            this._structureHashCache = inner(this.root)
        }

        return (this._structureHashCache >>> 0) + ''
    }

    onCurrentLine(id, currents) {
        let node = this.get(id)
        let {parentId} = node

        return parentId == null
            || (
                node.id === currents[parentId]
                || currents[parentId] == null
                && this.get(parentId).children[0] === node
            )
            && this.onCurrentLine(parentId, currents)
    }

    onMainLine(id) {
        return this.onCurrentLine(id, {})
    }

    toJSON() {
        return this.root
    }
}

module.exports = GameTree
