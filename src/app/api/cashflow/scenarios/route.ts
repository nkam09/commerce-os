import { requireUser } from "@/lib/auth/require-user";
import { getCashflowPageData, calculateScenarioOutputs } from "@/lib/services/cashflow-service";
import { apiSuccess, apiServerError, apiUnauthorized } from "@/lib/utils/api";
import type { ScenarioInputs } from "@/lib/services/cashflow-service";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const data = await getCashflowPageData(userId);
    return apiSuccess(data.savedScenarios);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") return apiUnauthorized();
    return apiServerError(err);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const body = await request.json();
    const { name, inputs } = body as { name: string; inputs: ScenarioInputs };

    if (!name || !inputs) {
      return apiServerError(new Error("Missing name or inputs"));
    }

    const outputs = calculateScenarioOutputs(inputs);

    const scenario = {
      id: `sc-${Date.now()}`,
      name,
      inputs,
      outputs,
    };

    return apiSuccess(scenario);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") return apiUnauthorized();
    return apiServerError(err);
  }
}
