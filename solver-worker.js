importScripts('solver.wasm-runtime.js');
let vmPromise;

self.onmessage = async event => {
  const { id, map, budget, type, optimalScore } = event.data;
  try {
    if (!self.TeaVM?.wasmGC) throw Error('The WASM runtime is unavailable.');
    vmPromise ||= self.TeaVM.wasmGC.load('solver.wasm');
    const vm = await vmPromise;
    const raw = vm.exports.solve(map, budget, type || 'default', optimalScore == null ? -2147483648 : Number(optimalScore), 10);
    self.postMessage({ id, result: typeof raw === 'string' ? raw : String(raw) });
  } catch (error) {
    self.postMessage({ id, error: error.message || String(error) });
  }
};
