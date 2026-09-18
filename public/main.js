import { CpModel, CpSolver } from "or-tools-wasm/cp-sat";

console.log("crossOriginIsolated:", window.crossOriginIsolated);

const model = new CpModel();

const x = model.newIntVar(0, 10, "x");
const y = model.newIntVar(0, 10, "y");

model.addLinearConstraint(x.plus(y), 0, 10);
model.maximize(x.times(3).plus(y.times(2)));

const solver = new CpSolver();

const status = await solver.solve(model, {
  numSearchWorkers: 1,
});

console.log("status:", solver.statusName(status));
console.log("x:", solver.value(x));
console.log("y:", solver.value(y));
console.log("objective:", solver.objectiveValue());
