import { MeshStandardMaterial } from "three";
import type { MaterialType } from "./types";
import { removeNullOrUndefined } from "../../../utils";

export const materials = (origin: MeshStandardMaterial): Record<MaterialType, MeshStandardMaterial> => ({
  DEFAULT: origin,
  FABRIC: new MeshStandardMaterial({ ...removeNullOrUndefined(origin), metalness: 0, roughness: 0.5, vertexColors: false }),
  METALIC: new MeshStandardMaterial({ ...removeNullOrUndefined(origin), metalness: 1.0, roughness: 0, vertexColors: false }),
});
