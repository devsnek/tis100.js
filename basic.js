'use strict';

const { TIS, Node, StackMemoryNode } = require('.');

const left = new Node(`
# generate a stream of numbers

ADD 1
MOV ACC, RIGHT
`.trim());

const right = new Node(`
START:
  MOV LEFT, ACC
  SAV             # save number to BAK

CHECK:            # sub 2 until ACC is 0 or -1
  SUB 2
  JLZ START       # -1 means its odd
  JEZ EVEN        # 0 means its even
  JMP CHECK

EVEN:
  SWP             # load BAK to ACC
  MOV ACC, DOWN   # send ACC to stack
`.trim());

const stack = new StackMemoryNode();

const tis = new TIS([
  [left, right],
  [null, stack],
]);

let steps = 0;

let lastBlocked = false;
setInterval(() => {
  if (tis.step()) {
    if (lastBlocked) {
      throw new Error('All nodes blocked');
    } else {
      lastBlocked = true;
    }
  } else {
    lastBlocked = false;
  }

  steps += 1;

  console.clear();
  console.log(`Step #${steps}`);
  tis.grid.forEach((row) => {
    row.forEach((node) => {
      if (node === null) {
        return;
      }
      let width = 0;
      const lines = [
        ` ${node.constructor.name} (${node.x}, ${node.y}) ACC:${node.ACC} BAK:${node.BAK} ${node.blocked ? 'Blocked' : ''}`,
        '',
      ];
      if (node.stack) {
        width = 20;
        node.stack.forEach((n) => {
          lines.push(`${n}`);
        });
      } else {
        node.source.split('\n').forEach((l, i) => {
          width = Math.max(l.length + 2, width);
          if (i === node.line) {
            lines.push(`> ${l}`);
          } else {
            lines.push(`  ${l}`);
          }
        });
      }
      const bar = '-'.repeat(width);
      lines.unshift(bar);
      lines.push(bar);
      console.log(lines.join('\n'));
      console.log();
    });
  });
}, 15);
