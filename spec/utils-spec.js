'use babel';

import { Queue, Stack } from '../lib/utils';

describe('Queue', () => {
  let queue;

  beforeEach(() => {
    queue = new Queue();
  });

  it('pushes an element on the queue', () => {
    expect(queue.size).toBe(0);
    queue.push(1);
    expect(queue.size).toBe(1);
  });

  it('pops an element from the queue', () => {
    for (var i = 1; i < 6; i++) {
      queue.push(i);
    }
    expect(queue.size).toBe(5);

    for (var j = 1; j < 6; j++) {
      expect(queue.pop()).toBe(j);
    }

    expect(queue.size).toBe(0);
  });

  it('shows the top element from the queue', () => {
    for (var i = 1; i < 6; i++) {
      queue.push(i);
    }
    expect(queue.size).toBe(5);

    for (var j = 1; j < 6; j++) {
      expect(queue.peek()).toBe(1);
    }
    expect(queue.size).toBe(5);
  });

  it('pushes a spread element on the queue in the proper order', () => {
    const arr = [1, 2, 3];
    queue.push(...arr);
    for (let i = 0; i < 3; i++) {
      expect(queue.pop()).toBe(arr[i]);
    }
  });

  it('pushes nothing on the queue when the spread element is empty', () => {
    queue.push(...[]);
    expect(queue.size).toBe(0);
  });

  it('returns true when empty, false when not', () => {
    expect(queue.empty()).toBe(true);
    queue.push(1);
    expect(queue.empty()).toBe(false);
  });
});

describe('Stack', () => {
  let stack;

  beforeEach(() => {
    stack = new Stack();
  });

  it('pushes an element on the stack', () => {
    expect(stack.size).toBe(0);
    stack.push(1);
    expect(stack.size).toBe(1);
  });

  it('pops an element from the stack', () => {
    for (var i = 1; i < 6; i++) {
      stack.push(i);
    }
    expect(stack.size).toBe(5);

    for (var j = 5; j > 0; j--) {
      expect(stack.pop()).toBe(j);
    }

    expect(stack.size).toBe(0);
  });

  it('shows the top element from the stack', () => {
    for (var i = 1; i < 6; i++) {
      stack.push(i);
    }
    expect(stack.size).toBe(5);

    for (var j = 1; j < 6; j++) {
      expect(stack.peek()).toBe(5);
    }
    expect(stack.size).toBe(5);
  });

  it('pushes a spread element on the stack in the proper order', () => {
    const arr = [1, 2, 3];
    stack.push(...arr);
    for (let i = 2; i > -1; i--) {
      expect(stack.pop()).toBe(arr[i]);
    }
  });

  it('pushes nothing on the stack when the spread element is empty', () => {
    stack.push(...[]);
    expect(stack.size).toBe(0);
  });

  it('returns true when empty, false when not', () => {
    expect(stack.empty()).toBe(true);
    stack.push(1);
    expect(stack.empty()).toBe(false);
  });
});
