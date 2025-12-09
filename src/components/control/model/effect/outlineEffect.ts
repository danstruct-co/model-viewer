import type { Effect } from "./types";
import OutlineMesh from "../../../object/mesh/outlineMesh";
import type { SkinnedMesh } from "three";

const outlineEffect: Effect = {
  add: (mesh) => {
    if (!mesh.geometry || mesh.userData.hasOutline || !(mesh as SkinnedMesh).isSkinnedMesh) {
      return;
    }

    const outlineMesh = new OutlineMesh(mesh);

    mesh.add(outlineMesh);
    mesh.userData.hasOutline = true;
    mesh.userData.outlineMesh = outlineMesh;
  },

  remove: (mesh) => {
    if (!mesh.userData.hasOutline) {
      return;
    }

    if (mesh.userData.outlineMesh) {
      mesh.remove(mesh.userData.outlineMesh);
      mesh.userData.outlineMesh = null;
    }

    mesh.userData.hasOutline = false;
  },
};

export default outlineEffect;
