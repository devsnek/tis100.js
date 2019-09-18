'use strict';

// The exact semantics of this implementation
// are unknown because I don't care to find out
// how the event loop schedules compared to the
// expected ordering of a TIS-100.

/* eslint-disable prefer-destructuring */

const INSTRUCTIONS = {
  NOP: [],
  MOV: ['SRC', 'DST'],
  SWP: [],
  SAV: [],
  ADD: ['SRC'],
  SUB: ['SRC'],
  NEG: [],
  JMP: ['LABEL'],
  JEZ: ['LABEL'],
  JNZ: ['LABEL'],
  JGZ: ['LABEL'],
  JLZ: ['LABEL'],
  JRO: ['SRC'],
};

const REGISTER_NAMES = [
  'ACC',
  'NIL',
  'LEFT',
  'RIGHT',
  'UP',
  'DOWN',
  'ANY',
  'LAST',
];

function parse(source) {
  const jumps = new Map();
  const instructions = [];
  source.split('\n').forEach((raw, lineIndex) => {
    const line = raw.split('#')[0].trim();
    if (line.length === 0) {
      return;
    }
    const re = /(?:(?<label>\w+):)|(:?(?<instruction>\w+)(?: (?<args>.+))?)/;
    const { groups: { label, instruction, args } } = re.exec(line);
    if (label) {
      jumps.set(label, instructions.length);
    }
    if (instruction) {
      let parsed = (args || '').split(',').map((x) => x.trim());
      if (parsed.length === 1 && parsed[0] === '') {
        parsed = [];
      }
      if (instruction === 'NOP') {
        if (parsed.length !== 0) {
          throw new SyntaxError();
        }
        instructions.push(['ADD', ['NIL'], lineIndex]);
        return;
      }
      const final = INSTRUCTIONS[instruction].map((type, index) => {
        const arg = parsed[index];
        switch (type) {
          case 'SRC': {
            if (REGISTER_NAMES.includes(arg)) {
              return arg;
            }
            const int = Number.parseInt(arg, 10);
            if (int >= -999 && int <= 999) {
              return int;
            }
            throw new SyntaxError();
          }
          case 'DST':
            if (REGISTER_NAMES.includes(arg)) {
              return arg;
            }
            throw new SyntaxError();
          case 'LABEL':
            return arg;
          default:
            throw new RangeError();
        }
      });
      if (final.length !== parsed.length) {
        throw new SyntaxError();
      }
      instructions.push([instruction, final, lineIndex]);
    }
  });
  // resolve jumps
  return instructions.map((instruction) => {
    if (INSTRUCTIONS[instruction[0]][0] === 'LABEL') {
      return [instruction[0], [jumps.get(instruction[1][0])], instruction[2]];
    }
    return instruction;
  });
}

function Deferred() {
  let resolve;
  let reject;
  const p = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  p.resolve = resolve;
  p.reject = reject;
  return p;
}

class Port {
  constructor() {
    this.takeWaiting = undefined;
    this.putWaiting = undefined;
    this.value = undefined;
  }

  async take() {
    if (this.putWaiting) {
      this.putWaiting.resolve();
      this.putWaiting = undefined;
      return this.value;
    }
    this.takeWaiting = new Deferred();
    return this.takeWaiting.then(() => this.value);
  }


  put(value) {
    this.value = value;
    if (this.takeWaiting) {
      this.takeWaiting.resolve();
      this.takeWaiting = undefined;
      return undefined;
    }
    this.putWaiting = new Deferred();
    return this.putWaiting;
  }
}

class Node {
  constructor(source) {
    this.tis = undefined;
    this.x = undefined;
    this.y = undefined;

    this.source = source;
    this.instructions = parse(source);

    this.pc = 0;
    this.running = false;
    this.lineIndex = 0;

    this.ACC = 0;
    this.BAK = 0;

    this.outLeft = new Port();
    this.outRight = new Port();
    this.outUp = new Port();
    this.outDown = new Port();
  }

  async getSrc(src) {
    if (typeof src === 'number') {
      return src;
    }
    switch (src) {
      case 'ACC':
        return this.ACC;
      case 'NIL':
        return 0;
      case 'LEFT':
        return this.tis.nodeAt(this.y, this.x - 1).outRight.take();
      case 'RIGHT':
        return this.tis.nodeAt(this.y, this.x + 1).outLeft.take();
      case 'UP':
        return this.tis.nodeAt(this.y - 1, this.x).outDown.take();
      case 'DOWN':
        return this.tis.nodeAt(this.y + 1, this.x).outUp.take();
      case 'ANY':
        return Promise.race([
          this.getSrc('LEFT'),
          this.getSrc('RIGHT'),
          this.getSrc('UP'),
          this.getSrc('DOWN'),
        ]);
      case 'LAST':
      default:
        throw new RangeError();
    }
  }

  setDst(dst, value) {
    // wrap value to (-999, 999)
    if (value > 999) {
      value = 999;
    }
    if (value < -999) {
      value = -999;
    }
    switch (dst) {
      case 'ACC':
        this.ACC = value;
        break;
      case 'NIL':
        break;
      case 'LEFT':
        return this.outLeft.put(value);
      case 'RIGHT':
        return this.outRight.put(value);
      case 'UP':
        return this.outUp.put(value);
      case 'DOWN':
        return this.outDown.put(value);
      case 'ANY':
      case 'LAST':
      default:
        throw new RangeError();
    }
    return undefined;
  }

  step() {
    if (!this.running) {
      this.innerStep();
    }
  }

  async innerStep() {
    this.running = true;
    // wrap out-of-bounds jumps
    if (this.pc < 0) {
      this.pc = 0;
    } else if (this.pc >= this.instructions.length) {
      this.pc = this.instructions.length - 1;
    }
    // read instruction
    const [instruction, args, lineIndex] = this.instructions[this.pc];
    this.pc += 1;
    this.lineIndex = lineIndex;
    // if instruction is last instruction, jump to first instruction
    if (this.pc === this.instructions.length) {
      this.pc = 0;
    }
    // run instruction
    switch (instruction) {
      case 'MOV': {
        const v = await this.getSrc(args[0]);
        await this.setDst(args[1], v);
        break;
      }
      case 'SWP': {
        const ACC = await this.getSrc('ACC');
        const BAK = this.BAK;
        await this.setDst('ACC', BAK);
        this.BAK = ACC;
        break;
      }
      case 'SAV':
        this.BAK = await this.getSrc('ACC');
        break;
      case 'ADD': {
        const ACC = await this.getSrc('ACC');
        const v = await this.getSrc(args[0]);
        await this.setDst('ACC', ACC + v);
        break;
      }
      case 'SUB': {
        const ACC = await this.getSrc('ACC');
        const v = await this.getSrc(args[0]);
        await this.setDst('ACC', ACC - v);
        break;
      }
      case 'NEG': {
        const ACC = await this.getSrc('ACC');
        await this.setDst('ACC', -ACC);
        break;
      }
      case 'JMP':
        this.pc = args[0];
        break;
      case 'JEZ': {
        const ACC = await this.getSrc('ACC');
        if (ACC === 0) {
          this.pc = args[0];
        }
        break;
      }
      case 'JNZ': {
        const ACC = await this.getSrc('ACC');
        if (ACC !== 0) {
          this.pc = args[0];
        }
        break;
      }
      case 'JGZ': {
        const ACC = await this.getSrc('ACC');
        if (ACC > 0) {
          this.pc = args[0];
        }
        break;
      }
      case 'JLZ': {
        const ACC = await this.getSrc('ACC');
        if (ACC < 0) {
          this.pc = args[0];
        }
        break;
      }
      case 'JRO':
        this.pc += args[0];
        break;
      default:
        throw new RangeError();
    }
    this.running = false;
    return this.ACC;
  }
}

class TIS {
  constructor(grid) {
    this.grid = grid;

    this.grid.forEach((row, y) => {
      row.forEach((node, x) => {
        node.tis = this;
        node.x = x;
        node.y = y;
      });
    });

    this.steps = 0;
  }

  nodeAt(y, x) {
    if (y === -1) {
      y = this.grid.length - 1;
    } else if (y === this.grid.length) {
      y = 0;
    }
    if (x === -1) {
      x = this.grid[y].length - 1;
    } else if (x === this.grid[y].length) {
      x = 0;
    }
    return this.grid[y][x];
  }

  async step() {
    this.steps += 1;
    return Promise.all(this.grid.flat().map((node) => node.step()));
  }
}

module.exports = { Node, TIS };
