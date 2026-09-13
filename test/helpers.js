// Скриптованный «ГПСЧ» для детерминированных тестов примитивов.
export function seqRng(values) {
  let i = 0;
  return function () {
    if (i >= values.length) throw new Error('seqRng исчерпан');
    return values[i++];
  };
}
