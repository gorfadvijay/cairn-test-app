/**
 * Axiom provisioner
 * Create/delete datasets via the Axiom API
 */

import { axiomApi } from "./api.ts";

interface CreateDatasetResult {
  datasetId: string;
  name: string;
}

/**
 * Create a new Axiom dataset for log ingestion
 */
export async function createAxiomDataset(
  name: string,
  description: string = "",
): Promise<CreateDatasetResult> {
  const result = await axiomApi<{
    id: string;
    name: string;
  }>("POST", "/datasets", { name, description });

  return {
    datasetId: result.id,
    name: result.name,
  };
}

/**
 * Delete an Axiom dataset
 */
export async function deleteAxiomDataset(
  name: string,
): Promise<void> {
  await axiomApi("DELETE", `/datasets/${name}`);
}

/**
 * List all Axiom datasets
 */
export async function listAxiomDatasets(): Promise<unknown[]> {
  return await axiomApi<unknown[]>("GET", "/datasets");
}
