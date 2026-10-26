import { cache } from "react";

import { getAlgorithmWorkflow } from "@/lib/algorithm/queries";

// Layout và page của cùng một request dùng chung kết quả, không truy vấn hai lần.
export const loadWorkflow = cache(getAlgorithmWorkflow);
export type AlgorithmData = NonNullable<Awaited<ReturnType<typeof getAlgorithmWorkflow>>>;
