// Simple seeded RNG (xorshift32)
export class RNG {
  constructor(seed = 1) {
    this.state = (seed >>> 0) || 1;
  }
  nextU32() {
    let x = this.state;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17; x >>>= 0;
    x ^= x << 5; x >>>= 0;
    this.state = x >>> 0;
    return this.state;
  }
  random() {
    return (this.nextU32() / 0xFFFFFFFF);
  }
  int(maxExclusive) {
    return Math.floor(this.random() * maxExclusive);
  }
  choice(arr) {
    return arr[this.int(arr.length)];
  }
}
