// 观察者接口
interface Observer<T> {
  next: (value: T) => void;
  error: (value: any) => void;
  complete: () => void;
}

// 单元函数 一元函数 类型别名
type UnaryFunction<T, R> = (source: T) => R;

// 操作符函数 类型别名
type OperatorFunction<T, R> = UnaryFunction<Observable<T>, Observable<R>>;

// 拆分逻辑 类型别名
type TeardownLogic = Subscription | Unsubscribable | void | (() => void);

// 不予订阅 接口
interface Unsubscribable {
  unsubscribe: () => void;
}

// 从数组开始的管道
function pipeFromArray<T, R>(
  /* 数组  元素为单元函数 */
  fns: Array<UnaryFunction<T, R>>
): UnaryFunction<T, R> {
  // 如果数组元素为空
  if (fns.length === 0) {
    // 返回一个匿名箭头函数，此函数返回参数本身
    return (input) => input as any as R;
  }

  // 如果数组元素只有一个
  if (fns.length === 1) {
    return fns[0];
  }

  // 排除以上情况
  // 返回一个匿名箭头函数，此函数返回以参数位初始值的reduce fns数组
  return (input: T): R => {
    /*
    reduce为数组中的每一个元素依次执行callback函数，不包括数组中被删除或从未被赋值的元素，接受四个参数：

    accumulator 累计器
    currentValue 当前值
    currentIndex 当前索引
    array 数组
    回调函数第一次执行时，accumulator 和currentValue的取值有两种情况：
    如果调用reduce()时提供了initialValue，accumulator取值为initialValue，
    currentValue取数组中的第一个值；如果没有提供 initialValue，
    那么accumulator取数组中的第一个值，currentValue取数组中的第二个值。

    实例：
    const array1 = [1, 2, 3, 4];
    const reducer = (previousValue, currentValue) => previousValue + currentValue;
    // 5 + 1 + 2 + 3 + 4
    console.log(array1.reduce(reducer, 5));
    // expected output: 15
     */
    return fns.reduce((prev: any, fn: any) => fn(prev), input);
  };
}

// 订阅类 实现了不予订阅接口
class Subscription implements Unsubscribable {
  // 拆解
  // private _teardowns: /* 不包含 */Exclude<TeardownLogic, void>[] = []; // 数组第一种写法
  private _teardowns: /* 不包含 */Array<Exclude<TeardownLogic, void>> = []; // 数组第二种写法
  unsubscribe(): void { // 取消订阅
    this._teardowns.forEach((teardown/* 拆卸 */) => {
      if (typeof teardown === 'function') { // 如果拆卸是函数
        teardown(); // 执行此函数
      } else { // 否则
        teardown.unsubscribe(); // 执行unsubscribe方法
      }
    });
  }
  add(teardown: TeardownLogic): void {
    if (teardown /* 拆卸 */) { // 如果teardown非空
      this._teardowns.push(teardown); // 将teardown添加到_teardowns
    }
  }
}

// 订阅者类 继承了订阅类 且实现了观察者接口
class Subscriber<T> extends Subscription implements Observer<T> {
  private isStopped = false; // 已停止
  type: string;
  // 构造函数
  constructor(private observer: Partial<Observer<T>>/* 传入观察者实例 */, type: string) {
    super(); // 执行父类构造函数
    this.type = type;
  }

  // Observer中的next方法
  next(value: T) {
    // 传入的观察者实例
    if (this.observer.next /* 如果传入观察者实例存在next方法 */ && !this.isStopped/* 没有停止 */) {
      this.observer.next(value); // 执行next方法，传入值
    }
  }

  // Observer中的error方法
  error(value: any) {
    // 有错误，则将isStopped设置为true，停止
    this.isStopped = true;
    if (this.observer.error) { // 如果存在error方法
      this.observer.error(value); // 执行error方法并传入值
    }
  }

  // Observer中的complete方法
  complete() {
    // 完成，则将isStopped设置为true，停止
    this.isStopped = true;
    if (this.observer.complete) {// 如果存在complete
      this.observer.complete(); // 执行complete方法
    }
    if (this.unsubscribe) { // 如果存在unsubscribe方法
      this.unsubscribe(); // 执行unsubscribe方法
    }
  }
}

// 可观察类
export class Observable<T> {
  type: string;
  // 构造函数
  constructor(private _subscribe: (observer: Observer<T>) => TeardownLogic, type: string = "user") {
    this._subscribe = _subscribe;
    this.type = type;
  }

  // 订阅函数
  subscribe(observer: Partial<Observer<T>>): Subscription {
    const subscriber = new Subscriber(observer, this.type); // 把观察者传入订阅者
    subscriber.add(this._subscribe(subscriber)); // 父类Subscription中的add方法，将订阅者放入_teardowns中
    return subscriber; // Subscriber继承了Subscription，所以此处可以返回
  }

  // 管道
  pipe(...operations/* 操作 */: OperatorFunction/* 操作符函数 */<any, any>[]): Observable<any> {
    return pipeFromArray(operations)(this); // 执行从数组开始的管道函数
  }
}

// map操作符
export function map<T, R>(project: (value: T, index: number) => R) {
  return (observable: Observable<T>) =>
    new Observable<R>((subscriber) => {
      let i = 0;
      const subcription = observable.subscribe({
        next(value) {
          return subscriber.next(project(value, i++));
        },
        error(err) {
          subscriber.error(err);
        },
        complete() {
          subscriber.complete();
        },
      });
      return subcription;
    }, "map");
}

// 防抖
// debounceTime 延时发送源 Observable 发送的值,但是会丢弃正在排队的发送如果源 Observable 又发出新值。
export function debounceTime<T, R>(delay: number) {
  let time: number = 0;
  return (observable: Observable<T>) =>
    new Observable<R>((subscriber) => {
      const subcription = observable.subscribe({
        next(value) {
          if (time) {
            clearTimeout(time)
          }
          time = setTimeout(() => {
            return subscriber.next(value as any as R);
          }, delay)
        },
        error(err) {
          clearTimeout(time)
          subscriber.error(err);
        },
        complete() {
          clearTimeout(time)
          subscriber.complete();
        },
      });
      return subcription;
    }, "debounceTime");
}
