import { Observable, map } from "./index";
const source = new Observable((observer) => {
    setTimeout(() => {
        observer.next(1);
    }, 3000);
    return {
        unsubscribe: () => console.log('done'),
    };
});
const subscription = source.pipe(map((i) => ++i)).subscribe({
    next: (v) => console.log(v),
    complete: () => console.log('complete'),
});
console.log(subscription);
