export function removeNullOrUndefined(obj: any) {
  Object.keys(obj).forEach((key: string) => (obj[key] === undefined || obj[key] === null) && delete obj[key]);
  return obj;
}
