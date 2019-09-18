'use strict';

/* eslint-disable prefer-destructuring */

// A lot of this logic is inspired by
// https://github.com/eviltrout/tis-100/

function split(s, c) {
  const index = s.indexOf(c);
  if (index === -1) {
    return [null, s];
  }
  return [s.slice(0, index), s.slice(index + 1, s.length)];
}

const INSTRUCTIONS = {
  __proto__: null,
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
  HCF: [],
};

const REGISTERS = ['ACC', 'NIL', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'ANY', 'LAST'];

const validateLabel = (l) => {
  if (!/[A-Z0-9~`$%^&*()_\-+={}[\]|\\;'"<>,.?/ ]/.test(l)) {
    throw new SyntaxError(`Expected a LABEL, got '${l}'`);
  }
};

function parse(source) {
  const instructions = [];
  const labels = new Map();

  source.split('\n').forEach((raw, lineIndex) => {
    const line = raw.trim().split('#')[0];
    if (line.length === 0) {
      return;
    }
    const [label, rest] = split(line, ':');
    if (label) {
      validateLabel(label);
      labels.set(label, instructions.length);
    }
    if (rest.trim().length === 0) {
      return;
    }
    const [instruction, ...args] = rest.trim().split(/[, ]+/);
    if (!INSTRUCTIONS[instruction]) {
      throw new SyntaxError(`Unknown instruction: ${instruction}`);
    }
    if (instruction === 'NOP') {
      if (args.length !== INSTRUCTIONS[instruction].length) {
        throw new SyntaxError('NOP expected no arguments');
      }
      instructions.push(['ADD', ['NIL'], lineIndex]);
      return;
    }
    const checked = INSTRUCTIONS[instruction].map((type, i) => {
      const parsed = args[i];
      switch (type) {
        case 'SRC': {
          if (REGISTERS.includes(parsed)) {
            return parsed;
          }
          const int = Number.parseInt(parsed, 10);
          if (int >= -999 && int <= 999) {
            return int;
          }
          throw new SyntaxError(`Expected SRC, got '${parsed}'`);
        }
        case 'DST':
          if (!REGISTERS.includes(parsed)) {
            throw new SyntaxError(`Expected DST, got '${parsed}'`);
          }
          return parsed;
        case 'LABEL':
          validateLabel(parsed);
          return parsed;
        default:
          throw new RangeError();
      }
    });
    instructions.push([instruction, checked, lineIndex]);
  });

  // resolve jump targets
  return instructions.map((line) => {
    const [instruction, args, lineIndex] = line;
    if (INSTRUCTIONS[instruction][0] === 'LABEL') {
      if (!labels.has(args[0])) {
        throw new SyntaxError(`Unknown labelL ${args[0]}`);
      }
      return [instruction, [labels.get(args[0])], lineIndex];
    }
    return line;
  });
}

class Node {
  constructor(source) {
    this.source = source;
    this.instructions = parse(source);

    this.x = 0;
    this.y = 0;

    this.pc = 0;
    this.line = 0;
    this.blocked = false;

    this.ACC = 0;
    this.BAK = 0;

    this.UP = false;
    this.DOWN = false;
    this.LEFT = false;
    this.RIGHT = false;
    this.LAST = false;

    this.outputPort = null;
    this.outputValue = null;
  }

  getInputPort(src) {
    switch (src) {
      case 'ANY':
        for (const port of [this.LEFT, this.RIGHT, this.UP, this.DOWN]) {
          if (port && port.outputPort === this) {
            return port;
          }
        }
        return false;
      case 'LAST':
        return this.LAST;
      case 'UP':
        return this.UP;
      case 'DOWN':
        return this.DOWN;
      case 'LEFT':
        return this.LEFT;
      case 'RIGHT':
        return this.RIGHT;
      default:
        throw new RangeError();
    }
  }

  getOutputPort(dst) {
    switch (dst) {
      case 'ANY':
        for (const port of [this.UP, this.LEFT, this.RIGHT, this.DOWN]) {
          if (port && port.instructions[port.pc] && port.instructions[port.pc][0] === 'MOV' && (port.instructions[port.pc][1][0] === 'ANY' || port[port.instructions[port.pc][1][0]] === this)) {
            return port;
          }
        }
        return false;
      case 'LAST':
        return this.LAST;
      case 'UP':
        return this.UP;
      case 'DOWN':
        return this.DOWN;
      case 'LEFT':
        return this.LEFT;
      case 'RIGHT':
        return this.RIGHT;
      default:
        throw new RangeError();
    }
  }

  read(src) {
    if (this.outputPort !== null) {
      return true;
    }
    if (typeof src === 'number') {
      return src;
    }
    switch (src) {
      case 'ACC':
        return this.ACC;
      case 'NIL':
        return 0;
      case 'UP':
      case 'DOWN':
      case 'LEFT':
      case 'RIGHT':
      case 'ANY':
      case 'LAST': {
        const port = this.getInputPort(src);
        if (port && port.outputPort === this) {
          const r = port.outputValue;
          port.outputValue = null;
          port.outputPort = null;
          if (port.pc === port.instructions.length) {
            port.pc = 0;
          } else {
            port.pc += 1;
          }
          if (src === 'ANY') {
            this.LAST = port;
          }
          return r;
        }
        return false;
      }
      default:
        throw new RangeError(`Unknown SRC: ${src}`);
    }
  }

  write(dst, value) {
    if (value < -999) {
      value = -999;
    } else if (value > 999) {
      value = 999;
    }
    switch (dst) {
      case 'ACC':
        this.ACC = value;
        break;
      case 'NIL':
        break;
      case 'UP':
      case 'DOWN':
      case 'LEFT':
      case 'RIGHT':
      case 'ANY':
      case 'LAST': {
        const port = this.getOutputPort(dst);
        if (port && this.outputPort === null) {
          this.outputPort = port;
          this.outputValue = value;
          if (dst === 'ANY') {
            this.LAST = port;
          }
        }
        return false;
      }
      default:
        throw new RangeError(`Unknown DST: ${dst}`);
    }
    return true;
  }

  step() {
    this.blocked = true;

    if (this.pc < 0) {
      this.pc = 0;
    } else if (this.pc >= this.instructions.length) {
      this.pc = 0;
    }

    const [instruction, args, line] = this.instructions[this.pc];
    this.line = line;

    switch (instruction) {
      case 'MOV': {
        const v = this.read(args[0]);
        if (v === false) {
          return false;
        }
        if (this.write(args[1], v) === false) {
          return false;
        }
        this.pc += 1;
        break;
      }
      case 'SWP':
        [this.ACC, this.BAK] = [this.BAK, this.ACC];
        this.pc += 1;
        break;
      case 'SAV':
        this.BAK = this.ACC;
        this.pc += 1;
        break;
      case 'ADD': {
        const v = this.read(args[0]);
        if (v === false) {
          return false;
        }
        this.ACC += v;
        this.pc += 1;
        break;
      }
      case 'SUB': {
        const v = this.read(args[0]);
        if (v === false) {
          return false;
        }
        this.ACC -= v;
        this.pc += 1;
        break;
      }
      case 'NEG':
        this.ACC = -this.ACC;
        this.pc += 1;
        break;
      case 'JMP':
        this.pc = args[0];
        break;
      case 'JEZ':
        if (this.ACC === 0) {
          this.pc = args[0];
        } else {
          this.pc += 1;
        }
        break;
      case 'JNZ':
        if (this.ACC !== 0) {
          this.pc = args[0];
        } else {
          this.pc += 1;
        }
        break;
      case 'JGZ':
        if (this.ACC > 0) {
          this.pc = args[0];
        } else {
          this.pc += 1;
        }
        break;
      case 'JLZ':
        if (this.ACC < 0) {
          this.pc = args[0];
        } else {
          this.pc += 1;
        }
        break;
      case 'JRO':
        this.pc += args[0];
        if (this.pc >= this.instructions.length) {
          this.pc = this.instructions.length - 1;
        }
        break;
      case 'HCF':
      default:
        throw new RangeError();
    }

    if (this.pc < 0) {
      this.pc = 0;
    } else if (this.pc >= this.instructions.length) {
      this.pc = 0;
    }

    this.blocked = false;

    return true;
  }
}

const STACK_MAX = 10;
class StackMemoryNode extends Node {
  constructor() {
    super('# STACK MEMORY NODE');

    this.stack = [];
  }

  step() {
    this.blocked = true;

    if (this.stack.length < STACK_MAX) {
      const v = this.read('ANY');
      if (v !== false) {
        this.stack.push(v);
      }
    }

    if (this.stack.length > 0) {
      const port = this.getOutputPort('ANY');
      if (port && port.outputPort === null) {
        this.outputPort = port;
        this.outputValue = this.stack.pop();
      }
    }

    this.blocked = false;

    return true;
  }
}

class TIS {
  constructor(grid) {
    this.grid = grid;
    this.grid.forEach((row, y) => {
      row.forEach((node, x) => {
        if (node === null) {
          return;
        }
        node.x = x;
        node.y = y;
        node.LEFT = row[x - 1] || false;
        node.RIGHT = row[x + 1] || false;
        const above = this.grid[y - 1];
        if (above) {
          node.UP = above[x] || false;
        }
        const below = this.grid[y + 1];
        if (below) {
          node.DOWN = below[x] || false;
        }
      });
    });
  }

  step() {
    let blocked = true;
    this.grid.forEach((row) => {
      row.forEach((node) => {
        if (node !== null) {
          node.step();
          if (!node.blocked && !(node instanceof StackMemoryNode)) {
            blocked = false;
          }
        }
      });
    });
    return blocked;
  }
}

module.exports = { TIS, Node, StackMemoryNode };
