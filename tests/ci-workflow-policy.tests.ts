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
    expect(ciWorkflow).toContain("pull_request:");
    expect(ciWorkflow).toContain("workflow_dispatch:");
    expect(
      ciWorkflow.match(/runs-on:\n {6}group: Public CI - Quarantined/gu),
    ).toHaveLength(2);
    expect(
      ciWorkflow.match(/labels: \[self-hosted, Linux, X64\]/gu),
    ).toHaveLength(2);
    expect(ciWorkflow).not.toContain("pull_request_target:");

    if (/pull_request:\s*\n/u.test(ciWorkflow)) {
      expect(ciWorkflow).toContain(
        "github.event.pull_request.head.repo.full_name == github.repository",
      );
    }
  });

  it("binds npm OIDC publication to exact main CI and a supported runtime", () => {
    expect(cdWorkflow).toContain("Enforce exact-main successful CI");
    expect(cdWorkflow).toContain("refs/remotes/origin/main");
    expect(cdWorkflow).toContain("-f branch=main");
    expect(cdWorkflow).toContain("-f event=push");
    expect(cdWorkflow).toContain('-f head_sha="${EXPECTED_SHA}"');
    expect(cdWorkflow).toContain('conclusion == "success"');
    expect(cdWorkflow).toContain("Verify release runtime");
    expect(cdWorkflow).toContain('ACTUAL_NODE%%.*');
    expect(cdWorkflow).toContain('"11.5.1"');
    expect(cdWorkflow).toContain("--provenance");
    expect(cdWorkflow).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN/u);
  });

  it("keeps production release workflows off pull-request triggers", () => {
    expect(cdWorkflow).toMatch(/on:\s*\n\s+workflow_dispatch:/u);
    expect(releasePrepareWorkflow).toMatch(/on:\s*\n\s+workflow_call:/u);
    expect(cdWorkflow).not.toMatch(/\n\s+pull_request(?:_target)?:/u);
    expect(releasePrepareWorkflow).not.toMatch(/\n\s+pull_request(?:_target)?:/u);
  });
});
