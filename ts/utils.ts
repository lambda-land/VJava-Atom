'use babel';
// Utility classes/types.


interface QueueNode<T> {
    item: T;
    next?: QueueNode<T>;
}

// Generic Queue.
export class Queue<T> {
    private startNode: QueueNode<T>;
    private endNode: QueueNode<T>;
    private _size: number;

    constructor() {
        this._size = 0;
    }

    get size(): number {
        return this._size;
    }

    empty(): boolean {
        return this.size === 0;
    }

    peek(): T {
        if (!this._size) {
            throw new Error('peek: cannot peek in empty queue');
        }
        return this.startNode.item;
    }

    pop(): T {
        if (!this._size) {
            throw new Error('pop: cannot pop from empty queue');
        }
        const val = this.startNode.item;

        this.startNode = this.startNode.next;
        if (!this.startNode) {
            // Prevent endNode from referencing the node being popped if it is
            // the last one.
            this.endNode = this.startNode;
        }

        this._size--;

        return val;
    }

    push(...items: T[]) {
        for (let item of items) {
            const newNode = {
                item: item
            }

            if (!this._size) {
                this.startNode = this.endNode = newNode;
            }
            else {
                this.endNode.next = newNode;
                this.endNode = this.endNode.next;
            }

            this._size++;
        }
    }
}
