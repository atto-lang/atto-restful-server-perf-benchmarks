// One profile registry shared by runner and receipt validator.
export const profiles = {
  smoke:{warmup:1,duration:2,trials:1,concurrency:[1,8],reuse:[true]},
  steady:{warmup:10,duration:10,trials:2,concurrency:[8,32],reuse:[true]},
  full:{warmup:30,duration:60,trials:5,concurrency:[1,8,32,128],reuse:[true,false]},
};
export function profileConfig(name) {
  if (!Object.hasOwn(profiles,name)) throw Error('unknown benchmark profile');
  return structuredClone(profiles[name]);
}
export function timedSeconds(name,targets,scenarios=3) {
  if(!Number.isSafeInteger(targets)||targets<1||!Number.isSafeInteger(scenarios)||scenarios<1)throw Error('invalid benchmark matrix');
  const c=profileConfig(name);
  const total=targets*scenarios*c.concurrency.length*c.reuse.length*c.trials*(c.warmup+c.duration);
  if(!Number.isSafeInteger(total))throw Error('benchmark matrix too large');
  return total;
}
