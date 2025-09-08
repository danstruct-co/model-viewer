import type { Mesh } from "three";

export interface Effect {
  add: (mesh: Mesh) => void;
  remove: (mesh: Mesh) => void;
}
