import { spawnSync } from "node:child_process";

const scenarios = [
    {
        name: "default",
        args: []
    },
    {
        name: "cdn-a-blocked",
        args: ["--cdnABlocked=true", "--requests=5000"]
    },
    {
        name: "all-cdns-blocked",
        args: ["--cdnABlocked=true", "--cdnBBlocked=true", "--cdnCBlocked=true", "--requests=5000"]
    },
    {
        name: "weak-peer-network",
        args: ["--peerShareRate=0.25", "--peerFailureRate=0.10", "--requests=5000"]
    },
    {
        name: "strong-peer-network",
        args: ["--peerShareRate=0.90", "--peerFailureRate=0.01", "--requests=5000"]
    }
];

for (const scenario of scenarios) {
    console.log("\n============================================================");
    console.log("Scenario: " + scenario.name);
    console.log("Command: node scripts/simulate-network.mjs " + scenario.args.join(" "));
    console.log("============================================================");

    const result = spawnSync(process.execPath, ["scripts/simulate-network.mjs", ...scenario.args], {
        stdio: "inherit",
        shell: false
    });

    if (result.status !== 0) {
        process.exit(result.status || 1);
    }
}
