import { assign, createActor,  setup, fromPromise} from "xstate";
import { speechstate } from "speechstate";
import type { Settings } from "speechstate";
import type { DMEvents, DMContext, Message} from "./types";
import { KEY } from "./azure.ts";

const azureCredentials = {
  endpoint:
    "https://northeurope.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const settings: Settings = {
  azureCredentials: azureCredentials,
  azureRegion: "northeurope",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actions: {
    sst_prepare: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
    sst_listen: ({ context }) => context.spstRef.send({ type: "LISTEN" }),
  },
  actors:{
    getModels: fromPromise<any,null>(() => 
      fetch("http://localhost:11434/api/tags").then((response) =>
        response.json()
      )
    ),
    modelReply : fromPromise<any, Message[]> (({input}) => {
      const contradictionResult = input.find(
        (m: any) => m.role === "system" && m.content.startsWith("Contradiction analysis")
      );
      
      // 给 LLM 一个清晰的指令，让它参考矛盾检测结果
      const systemPrompt = {
        role: "system",
        content: `You are a contradiction-resolving dialogue assistant. 
The contradiction detection result is: "${contradictionResult?.content || "unknown"}". 
If there is a contradiction, politely explain or correct it before continuing the conversation.`,
      };
      const fullMessages = [
        systemPrompt,
        ...input.filter((m: any) => m.role !== "system" || !m.content.startsWith("Contradiction analysis")),
      ];

      const body = {
        model: "llama3:latest",
        stream: false,
        messages: fullMessages,
        temperature : 0.8,
      };
      return fetch("http://localhost:11434/api/chat", {
        method: "POST",
        body: JSON.stringify(body),
      }).then((response) => response.json());
    }
    ), 
    contradictionCheck: fromPromise<any, Message[]>(({ input }) => {
      const body = {
        model: "contradiction-model:latest",
        stream: false,
        messages: input,
        temperature: 0,
      };
      return fetch("http://localhost:11434/api/chat", {
        method: "POST",
        body: JSON.stringify(body),
      }).then((response) => response.json());
    }),
  },
}).createMachine({
  id: "DM",
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    informationState: { latestMove: "ping" },
    lastResult: "",
    messages:[],
    ollamaModels:[],
  }),
  initial: "Prepare",
  states: {
    Prepare: {
      entry: "sst_prepare",
      on: {
        ASRTTS_READY: "GetModels",
      },
    },
    GetModels:{
      invoke:{
        src:"getModels",
        input: null,
        onDone:{
          target: "Main",
          actions: assign(({ event }) => {
              return {
              ollamaModels:event.output.models.map((x:any) => x.name)
            }
          })
        }
      },
    },
    Main: {
      initial: "Prompt",
      states:{
        Prompt: { 
          entry: assign(({ context }) => ({
            messages: [
              {
                role: "system",
                content: `Hello! The models are ${context.ollamaModels?.join(" ")}`
              },
              ...context.messages
            ]
          })),
          on:{
            CLICK : "SpeakPrompt"
          }
        },
      
      SpeakPrompt: {
        entry: ({ context }) =>
          context.spstRef.send({
            type: "SPEAK",
            value: { utterance: context.messages[0].content },
          }),
        on: { SPEAK_COMPLETE: "Ask" }
      },

      Ask: {
        entry: "sst_listen",
        on: {
          LISTEN_COMPLETE:{
            target:"CheckContradiction"
          },
          RECOGNISED:{
            actions: assign(({ event, context }) => ({
              ...context.messages,
              messages: [{role: "user", content: event.value[0].utterance}, 
              ],
            })),
          },
          ASR_NOINPUT:{
            target: "CheckContradiction",
            actions: assign(({context}) => ({
              messages:[
                ...context.messages,
                {role:"user",content: ""}
              ]
            }))
          },
        },
      },

      CheckContradiction: {
        invoke: {
          src: "contradictionCheck",
          input: (context) => context.context.messages,
          onDone: {
            target: "ChatCompletion",
            actions: assign(({ event, context}) => {
              // 假设 event.output.message.content 返回 "CONTRADICTION" 或 "NO_CONTRADICTION"
              const result = 
              event.output.message?.content?.toLowerCase?.() ||
              event.output[0]?.message?.content?.toLowerCase?.() ||
              "unknown";
              return {
                messages: [
                  ...context.messages,
                  {
                    role: "system",
                    content: `Contradiction analysis result: ${result}`,
                  },
                ],
              };
            }),
          }
        },
      },

      ChatCompletion:{
        invoke:{
          src: "modelReply",
          input: (context) => context.context.messages,
          onDone:{
            target: "Speaking",
            actions: assign(({event, context}) => {
              const reply =
              event.output.message?.content ||
              event.output[0]?.message?.content ||
              "(no reply)";
              console.log("Raw output:", event.output);
              return {
                messages:[
                  ...context.messages,
                  {role:"assistant",content: reply},
                ]
              }
            })
          }
        }
      },

      Speaking: {
        entry: ({ context }) => {
          const msgs = context.messages;
          const lastMsg = msgs[msgs.length - 1]; 
          if (lastMsg && lastMsg.role === "assistant") {
            context.spstRef.send({
              type: "SPEAK",
              value: { utterance: lastMsg.content },
            });
          }
        },
        on: { SPEAK_COMPLETE: "Ask" },
      },

      },
    },
  },
});

const dmActor = createActor(dmMachine, {}).start();

dmActor.subscribe((state) => {
  console.group("State update");
  console.log("State value:", state.value);
  console.log("State context:", state.context);
  console.groupEnd();
});

export function setupButton(element: HTMLButtonElement) {
  element.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" });
  });
  dmActor.subscribe((snapshot) => {
    const meta: { view?: string } = Object.values(
      snapshot.context.spstRef.getSnapshot().getMeta()
    )[0] || {
      view: undefined,
    };
    element.innerHTML = `${meta.view}`;
  });
}
