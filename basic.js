'use strict';

const { table } = require('table');
const { TIS, Node, StackMemoryNode } = require('.');

const left = new Node(`
ADD 1
MOV ACC, RIGHT
`.trim());

const right = new Node(`
START:
  MOV LEFT, ACC
  SAV
CHECK:
  SUB 2
  JLZ START
  JEZ EVEN
  JMP CHECK
EVEN:
  SWP
  MOV ACC, DOWN
`.trim());

const stack = new StackMemoryNode();

const tis = new TIS([
  [left, right],
  [null, stack],
]);

const DISABLED_NODE = ` Disabled Node        X
                    X
                   X
                  X
                X
               X
              X
             X
           X
          X
         X
        X
      X
     X
    X
  X
 X
X`;

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

  const options = {
    columns: {},
  };
  const cells = tis.grid.map((row) =>
    row.map((node, column) => {
      options.columns[column] = { width: 23 };
      if (node === null) {
        return DISABLED_NODE;
      }
      const lines = [
        node.name,
        `ACC: ${node.ACC} | BAK: ${node.BAK}${node.blocked ? ' | BL' : ''}`,
        '',
      ];
      if (node.stack) {
        node.stack.forEach((item, i) => {
          if (i === node.stack.length - 1) {
            lines.push(`> ${item}`);
          } else {
            lines.push(`  ${item}`);
          }
        });
      } else {
        node.source
          .split('\n')
          .forEach((l, i) => {
            if (i === node.line) {
              lines.push(`> ${l}`);
            } else {
              lines.push(`  ${l}`);
            }
          });
      }
      return Object.assign(Array.from({ length: 17 }), lines).join('\n');
    }));

  console.clear();
  console.log(`TIS-100 (JavaScript) Step #${steps}`);
  console.log(table(cells, options));
}, 45);
