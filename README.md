# TIS-100 Implementation in JavaScript

```js
import { Node, TIS } from 'tis100.js';

const left = new Node(`
ADD 1
MOV ACC, RIGHT
`);

const right = new Node(`
MOV LEFT, ACC
`);

const tis = new TIS([
  [left, right],
]);

while (true) {
  const allBlocked = tis.step();
  console.log(right.ACC); // 1, 2, 3, ...
}
```

Check out `basic.js` for an more complex example.

`async.js` contains the first prototype, which used
promises instead of instruction continuations.
