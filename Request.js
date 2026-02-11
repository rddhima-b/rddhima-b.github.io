export class Request {
  constructor(origin, dest, day, time, name, email) {
    this.origin = origin;
    this.dest = dest;
    this.day = day;
    this.time = time;
    this.name = name;
    this.email = email;
  }

  getOrigin() {
    return this.origin;
  }

  getDest() {
    return this.dest;
  }

  getDay() {
    return this.day;
  }

  getTime() {
    return this.time;
  }

  getName() {
    return this.name;
  }

  getEmail() {
    return this.email;
  }

  toString() {
    return `Og: ${this.origin}, dest: ${this.dest}, day: ${this.day}, time: ${this.time}, email: ${this.email}`;
  }
}
