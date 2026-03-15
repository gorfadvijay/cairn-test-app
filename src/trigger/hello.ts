import { task } from "@trigger.dev/sdk/v3";

export const helloTask = task({
  id: "hello-cairn",
  run: async (payload: { name: string }) => {
    console.log(`Hello from Cairn, ${payload.name}!`);
    return { message: `Hello ${payload.name}`, timestamp: new Date().toISOString() };
  },
});
