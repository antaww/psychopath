if (import.meta.env.MODE === 'production') {
  console.log = function () {};
  console.warn = function () {};
  console.error = function () {};
  console.info = function () {};
  console.debug = function () {};
  // You can add more console methods if you use them, e.g., console.table, console.trace
} 