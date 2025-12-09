import type { Effect } from "./types";
import RimLightMesh from "../../../object/mesh/rimLightMesh";
import type { SkinnedMesh } from "three";

const rimLightEffect: Effect = {
  add: (mesh) => {
    if (!mesh.geometry || mesh.userData.hasRimLight || !(mesh as SkinnedMesh).isSkinnedMesh) {
      return;
    }

    const rimLightMesh = new RimLightMesh(mesh);

    mesh.add(rimLightMesh);
    mesh.userData.hasRimLight = true;
    mesh.userData.rimLightMesh = rimLightMesh;
  },

  remove: (mesh) => {
    if (!mesh.userData.hasRimLight) {
      return;
    }

    if (mesh.userData.rimLightMesh) {
      mesh.remove(mesh.userData.rimLightMesh);
      mesh.userData.rimLightMesh = null;
    }

    mesh.userData.hasRimLight = false;
  },
};

export default rimLightEffect;
