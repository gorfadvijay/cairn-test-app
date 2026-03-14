import { parseCairnHcl } from "./hcl.ts";

const config = parseCairnHcl("examples/hello-world/cairn.hcl");
console.log(JSON.stringify(config, null, 2));
