import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readWorkflow = (name: string): string =>
  readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8");

const ciWorkflow = readWorkflow("ci");
const cdWorkflow = readWorkflow("cd");
const releasePrepareWorkflow = readWorkflow("release-prepare");
const configurableSelfHostedRunner =
  "runs-on: ${{ fromJSON(vars.CD_RUNNER_LABELS || '[\"self-hosted\",\"Linux\",\"X64\"]') }}";
const hostedProductionRunner = "runs-on: ubuntu-latest";

describe("workflow trust boundaries", () => {
  it("runs both production release jobs on GitHub-hosted production runners", () => {
    expect(cdWorkflow).toContain(hostedProductionRunner);
    expect(releasePrepareWorkflow).toContain(hostedProductionRunner);
    expect(cdWorkflow).not.toContain(configurableSelfHostedRunner);
    expect(releasePrepareWorkflow).not.toContain(configurableSelfHostedRunner);
    expect(cdWorkflow).toContain("environment: production");
    expect(releasePrepareWorkflow).toContain("environment: production");
  });

  it("does not expose a self-hosted runner to fork pull requests", () => {
    expect(ciWorkflow).not.toContain("pull_request_target:");

    if (/pull_request:\s*\n/u.test(ciWorkflow)) {
      expect(ciWorkflow).toContain(
        "github.event.pull_request.head.repo.full_name == github.repository",
      );
    }
  });

  it("keeps production release workflows off pull-request triggers", () => {
    expect(cdWorkflow).toMatch(/on:\s*\n\s+workflow_dispatch:/u);
    expect(releasePrepareWorkflow).toMatch(/on:\s*\n\s+workflow_call:/u);
    expect(cdWorkflow).not.toMatch(/\n\s+pull_request(?:_target)?:/u);
    expect(releasePrepareWorkflow).not.toMatch(/\n\s+pull_request(?:_target)?:/u);
  });
});
