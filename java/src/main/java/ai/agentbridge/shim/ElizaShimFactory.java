package ai.agentbridge.shim;

import ai.agentbridge.api.AgentSystem;
import ai.agentbridge.api.AgentSystemFactory;
import ai.agentbridge.api.UI;

public class ElizaShimFactory implements AgentSystemFactory {
    @Override
    public AgentSystem create(UI ui) {
        return new ElizaShim(ui);
    }
}
