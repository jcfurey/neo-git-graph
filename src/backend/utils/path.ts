const FS_REGEX = /\\/g;

export function getPathFromStr(str: string) {
  return str.replace(FS_REGEX, "/");
}
