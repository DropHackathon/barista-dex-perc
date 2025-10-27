"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Mock chalk for Jest tests
const createChainable = () => {
    const fn = (text) => text;
    fn.bold = fn;
    fn.dim = fn;
    fn.italic = fn;
    fn.underline = fn;
    return fn;
};
const chalk = {
    bold: createChainable(),
    green: createChainable(),
    red: createChainable(),
    yellow: createChainable(),
    blue: createChainable(),
    cyan: createChainable(),
    gray: createChainable(),
    dim: createChainable(),
};
exports.default = chalk;
//# sourceMappingURL=chalk.js.map