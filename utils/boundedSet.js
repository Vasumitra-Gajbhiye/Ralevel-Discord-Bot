function createBoundedSet(maxSize) {
  const values = new Set();
  const order = [];

  return {
    has(value) {
      return values.has(value);
    },
    add(value) {
      if (values.has(value)) return;
      values.add(value);
      order.push(value);
      while (order.length > maxSize) {
        values.delete(order.shift());
      }
    },
    get size() {
      return values.size;
    },
  };
}

module.exports = { createBoundedSet };
