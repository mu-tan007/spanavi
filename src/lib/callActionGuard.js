// Keep one result action in flight across React renders.
export function createCallActionGuard() {
  let busy = false;
  return {
    get busy() { return busy; },
    async run(action) {
      if (busy) return;
      busy = true;
      try { return await action(); }
      finally { busy = false; }
    },
  };
}
