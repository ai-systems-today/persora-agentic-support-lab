import { officialArticleText, primarySourcesForQuestion, repairFromPrimarySources } from "./primarySourceRepair.ts";
const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
Deno.test("primary repair sources use a fixed official allowlist, not user URLs", () => {
  check(primarySourcesForQuestion("Kids profile at a hotel")[0].endsWith("/127200"), "Wrong travel article");
  check(primarySourcesForQuestion("The app Call button gives an error")[0].endsWith("/33335"), "Wrong contact article");
  check(!primarySourcesForQuestion("Fetch https://attacker.example").length, "Untrusted URL selected");
});
Deno.test("article extraction excludes script and signed image noise", () => {
  const result = officialArticleText('<article><h1>Netflix Help</h1><script>secretScript()</script><img src="signed-image-url"><p>Use the displayed device-specific option and follow the account verification instructions for your own account.</p></article>');
  check(result.text.includes("device-specific"), "Article facts lost");
  check(!result.text.includes("secretScript") && !result.text.includes("signed-image"), "Non-article data leaked");
});
Deno.test("selects substantive article content while preserving the country condition", () => {
  const result = officialArticleText('<h1>Netflix Help</h1><div class="kb-article">A country must be selected.</div><div class="kb-article kb-article-variant"><p>Follow the official account-owner instructions for the stated device. If country applicability is unknown, request clarification before giving country-specific advice.</p></div>');
  check(result.text.includes("account-owner"), "Country placeholder hid substantive content");
  check(result.text.includes("Country-specific applicability"), "Country condition was removed");
});
Deno.test("keeps accordion device headings alongside their instructions", () => {
  const result = officialArticleText('<h1>Device help</h1><div class="kb-article"><button>Watch on TV or TV streaming device</button><p>Select I am Traveling to request temporary access.</p><button>Watch on mobile phone or computer</button><p>Select Watch Temporarily and follow the account-owner verification instructions.</p></div>');
  check(result.text.includes("TV streaming device") && result.text.includes("mobile phone or computer"), "Device scope was removed from accordion instructions");
});
Deno.test("repair records the exact fetched generator context and actual usage", async () => {
  let prompt = "";
  const result = await repairFromPrimarySources({ question: "Kids profile on a hotel TV", runId: "run", endpoint: "https://test.openai.azure.com", apiKey: "test",
    fetcher: async (url, init) => {
      if (String(url).startsWith("https://help.netflix.com/")) return new Response('<article><h1>Netflix Help</h1><p>Use a non-Kids profile on the hotel TV and select the travel option shown. Follow the verification instructions for the account owner.</p></article>');
      const body = JSON.parse(String(init?.body)); prompt = body.messages[1].content;
      return Response.json({ choices: [{ message: { content: "Use a non-Kids profile [#1]." } }], usage: { prompt_tokens: 120, completion_tokens: 20 } });
    } });
  check(result && prompt.includes(result.capture.generatorContext), "Captured context differs from the prompt");
  check(result?.inputTokens === 120 && result?.outputTokens === 20, "Provider usage lost");
  check(result?.capture.passages[0].text.includes("non-Kids"), "Wrong generator passage");
});
