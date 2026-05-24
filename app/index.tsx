import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, SafeAreaView, ScrollView, Text, View } from "react-native";
import { BrandHeader } from "../src/components/BrandHeader";
import { BuildingScreen } from "../src/screens/BuildingScreen";
import { DoneScreen } from "../src/screens/DoneScreen";
import PricrLogo from "../src/components/PricrLogo";
import { GetStartedScreen } from "../src/screens/GetStartedScreen";
import { API_URL, B, DEFAULT_BRAND, MASTER_CODE } from "../src/constants/brand";
import { DEMO_BUSINESSES } from "../src/constants/demos";
import { KIT_CONVERSATION_PROMPT, SCHEMA_BUILDER_PROMPT } from "../src/constants/prompts";
import { HistoryScreen } from "../src/screens/HistoryScreen";
import { LoginScreen } from "../src/screens/LoginScreen";
import { MasterDashboard } from "../src/screens/MasterDashboard";
import { MeetKitScreen } from "../src/screens/MeetKitScreen";
import { QuoteScreen } from "../src/screens/QuoteScreen";
import { RepJoinScreen } from "../src/screens/RepJoinScreen";
import { SettingsScreen } from "../src/screens/SettingsScreen";
import { SetupScreen } from "../src/screens/SetupScreen";
import { SignupBrandScreen } from "../src/screens/SignupBrandScreen";
import { SignupScreen } from "../src/screens/SignupScreen";
import { UsersScreen } from "../src/screens/UsersScreen";
import { WelcomeScreen } from "../src/screens/WelcomeScreen";
import { s } from "../src/styles";
import { addQuote, clearCurrentUser, deleteBusiness, getBusiness, getCurrentUser, getUsers, runStartupMigrations, saveBusiness, saveCurrentUser, saveUsers } from "../src/storage";
import { BrandConfig, Business, DemoBusiness, Screen, User } from "../src/types";
import { isValidHex } from "../src/utils/color";
import { generateCode, parseSchemaFromResponse } from "../src/utils/helpers";
import { buildSchemaSummary, sampleFieldValues, sampleQuotes } from "../src/utils/quote";

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function Index() {
  const [screen, setScreen] = useState<Screen>("splash");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [logoTapCount, setLogoTapCount] = useState(0);
  const [showMasterEntry, setShowMasterEntry] = useState(false);
  const [masterInput, setMasterInput] = useState("");
  const [masterError, setMasterError] = useState("");
  const [isDemoMode, setIsDemoMode] = useState(false);

  const [setupServices, setSetupServices] = useState("");
  const [setupProducts, setSetupProducts] = useState("");
  const [setupPricing, setSetupPricing] = useState("");

  const [authName, setAuthName] = useState("");
  const [authPin, setAuthPin] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [authError, setAuthError] = useState("");

  const [signupBizName, setSignupBizName] = useState("");
  const [signupBrand, setSignupBrand] = useState<BrandConfig>({ ...DEFAULT_BRAND });

  const [kitMessages, setKitMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [kitInput, setKitInput] = useState("");
  const [kitLoading, setKitLoading] = useState(false);
  const [kitStarted, setKitStarted] = useState(false);
  const [kitReady, setKitReady] = useState(false);
  const [justBuilt, setJustBuilt] = useState(false);
  const [quoteInitialValues, setQuoteInitialValues] = useState<Record<string, any> | undefined>(undefined);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => { runStartupMigrations().then(checkSession); }, []);

  const checkSession = async () => {
    try {
      const user = await getCurrentUser();
      if (user) {
        if (user.role === "superadmin") {
          // Superadmins never auto-resume — drop the session and force a fresh master code entry.
          await clearCurrentUser();
          setTimeout(() => setScreen("welcome"), 600);
          return;
        }
        const biz = await getBusiness(user.businessCode);
        if (biz) {
          setCurrentUser(user);
          setBusiness(biz);
          setTimeout(() => setScreen("done"), 600);
          return;
        }
      }
    } catch { }
    setTimeout(() => setScreen("welcome"), 600);
  };

  const handleLogoTap = () => {
    const newCount = logoTapCount + 1;
    setLogoTapCount(newCount);
    if (newCount >= 5) {
      setLogoTapCount(0);
      setShowMasterEntry(true);
    }
  };

  const handleMasterLogin = async () => {
    if (masterInput === MASTER_CODE) {
      const superUser: User = { id: "superadmin_christian", name: "Christian Schaffner", role: "superadmin", businessCode: "PRICR_MASTER" };
      await saveCurrentUser(superUser);
      setCurrentUser(superUser);
      setShowMasterEntry(false);
      setMasterInput("");
      setScreen("master");
    } else {
      setMasterError("Invalid master code.");
    }
  };

  const pickImage = async (): Promise<string | null> => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [10, 3],
      quality: 0.8,
    });
    return !result.canceled && result.assets[0] ? result.assets[0].uri : null;
  };
  const pickLogo = async () => { const uri = await pickImage(); if (uri) setSignupBrand(b => ({ ...b, logoUri: uri })); };

  const handleSignUp = async (brandConfigured: boolean = true) => {
    if (!signupBizName.trim() || !authName.trim() || !authPin.trim()) { setAuthError("Please fill in all fields."); return; }
    if (authPin.length < 4) { setAuthError("PIN must be at least 4 digits."); return; }
    const finalColor = isValidHex(signupBrand.primaryColor) ? signupBrand.primaryColor : "#2979FF";
    try {
      const code = generateCode();
      const user: User = { id: Date.now().toString(), name: authName, role: "admin", businessCode: code };
      const biz: Business = {
        code, name: signupBizName, ownerName: authName, adminPin: authPin,
        brand: { ...signupBrand, primaryColor: finalColor },
        schema: null, createdAt: Date.now(), brandConfigured,
      };
      await saveBusiness(biz);
      await saveUsers(code, [user]);
      await saveCurrentUser(user);
      setCurrentUser(user);
      setBusiness(biz);
      setAuthError("");
      setScreen("setup");
    } catch { setAuthError("Something went wrong. Try again."); }
  };

  const handleAdminLogin = async () => {
    if (!authCode.trim() || !authPin.trim()) { setAuthError("Enter your business code and PIN."); return; }
    try {
      const biz = await getBusiness(authCode.toUpperCase());
      if (!biz) { setAuthError("Business code not found."); return; }
      if (biz.adminPin !== authPin) { setAuthError("Incorrect PIN."); return; }
      const users = await getUsers(biz.code);
      const admin = users.find(u => u.role === "admin");
      if (!admin) { setAuthError("Admin not found."); return; }
      await saveCurrentUser(admin);
      setCurrentUser(admin);
      setBusiness(biz);
      setAuthError("");
      setScreen("done");
    } catch { setAuthError("Something went wrong. Try again."); }
  };

  const handleRepJoin = async () => {
    if (!authName.trim() || !authCode.trim()) { setAuthError("Enter your name and business code."); return; }
    try {
      const biz = await getBusiness(authCode.toUpperCase());
      if (!biz) { setAuthError("Business code not found. Check with your admin."); return; }
      const user: User = { id: Date.now().toString(), name: authName, role: "rep", businessCode: biz.code };
      const users = await getUsers(biz.code);
      users.push(user);
      await saveUsers(biz.code, users);
      await saveCurrentUser(user);
      setCurrentUser(user);
      setBusiness(biz);
      setAuthError("");
      setScreen("done");
    } catch { setAuthError("Something went wrong. Try again."); }
  };

  const handleSignOut = async () => {
    await clearCurrentUser();
    setCurrentUser(null);
    setBusiness(null);
    setIsDemoMode(false);
    setScreen("welcome");
  };

  const startDemo = async (demo: DemoBusiness) => {
    const demoUser: User = { id: "demo", name: "Demo User", role: "admin", businessCode: "DEMO" };
    const demoBiz: Business = {
      code: "DEMO", name: demo.name, ownerName: "Demo User", adminPin: "0000",
      brand: { primaryColor: demo.color, secondaryColor: demo.color, logoUri: null, tagline: demo.tagline, phone: demo.phone, email: "", address: "" },
      schema: demo.schema, createdAt: Date.now(),
    };
    // Start every demo from a clean slate — wipe any prior "DEMO" data, then save fresh.
    await deleteBusiness("DEMO");
    await saveBusiness(demoBiz);
    setCurrentUser(demoUser);
    setBusiness(demoBiz);
    setIsDemoMode(true);
    setScreen("quote");
  };

  const startKitChat = async () => {
    setKitReady(false);
    setKitLoading(true);
    try {
      const formSummary = `Business: ${business?.name}\nOwner: ${currentUser?.name}\nServices: ${setupServices}\nMaterials: ${setupProducts || "Not specified"}\nPricing: ${setupPricing}`;
      // Trade detection: open by inferring the trade from the business name so the first message feels instantly smart.
      const opener = `The business is named "${business?.name}". Before asking anything, infer their likely trade from that name and OPEN with a one-sentence confirmation, e.g. "${business?.name} — looks like you build decks, is that right? I'll build your quoting tool around deck construction." If the name is ambiguous, instead ask what they do. Then continue the conversation.\n\n${formSummary}`;
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 600, system: KIT_CONVERSATION_PROMPT, messages: [{ role: "user", content: opener }] }),
      });
      const data = await response.json();
      setKitMessages([{ role: "assistant", content: data.content[0].text.trim() }]);
      setKitStarted(true);
    } catch {
      setKitMessages([{ role: "assistant", content: "Hey, good to meet you. What is the main way you measure or size a job?" }]);
      setKitStarted(true);
    }
    setKitLoading(false);
  };

  const buildSchema = async (conversation: { role: "user" | "assistant"; content: string }[]) => {
    setScreen("building");
    const fallbackSchema = DEMO_BUSINESSES.find(d => d.trade === "Christmas Lights")!.schema;
    let finalSchema: any = fallbackSchema;
    try {
      const formSummary = `Business: ${business?.name}\nServices: ${setupServices}\nMaterials: ${setupProducts}\nPricing: ${setupPricing}`;

      // Pass the full Kit conversation as real user/assistant turns, then a final build instruction.
      // The conversation starts with Kit (assistant), so lead with a user message to satisfy role
      // alternation; clone the turns so we never mutate kitMessages state.
      const messages: { role: "user" | "assistant"; content: string }[] = [
        { role: "user", content: `Here is the context from our setup.\n\nBUSINESS:\n${formSummary}` },
        ...conversation.map(m => ({ role: m.role, content: m.content })),
      ];
      const buildInstruction = "Based on everything in our conversation above, build the complete custom quote tool schema now. Output only the JSON schema, no other text.";
      const lastMsg = messages[messages.length - 1];
      // Avoid two user turns in a row: merge into the last turn if it's already a user message.
      if (lastMsg.role === "user") lastMsg.content += `\n\n${buildInstruction}`;
      else messages.push({ role: "user", content: buildInstruction });

      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 4000, system: SCHEMA_BUILDER_PROMPT, messages }),
      });
      const data = await response.json();
      const text = data?.content?.[0]?.text;
      if (typeof text !== "string") throw new Error("schema builder response had no content[0].text");
      const parsed = parseSchemaFromResponse(text);
      if (parsed === null) throw new Error("could not parse schema JSON from model response");
      finalSchema = parsed;
    } catch (err) {
      // Genuine error path: schema build failed, falling back to the demo schema.
      console.warn("[buildSchema] build failed, using fallback schema:", err instanceof Error ? err.message : String(err));
      finalSchema = fallbackSchema;
    }
    // ── Common tail: Kit's plain-English summary, persist, and seed 3 sample quotes ──
    const kitSummary = buildSchemaSummary(finalSchema);
    const updatedBiz = { ...business!, schema: finalSchema, kitSummary };
    await saveBusiness(updatedBiz);
    setBusiness(updatedBiz);
    try { for (const q of sampleQuotes(finalSchema)) await addQuote(updatedBiz.code, q); } catch { }
    setJustBuilt(true);
    setTimeout(() => setScreen("done"), 500);
  };

  useEffect(() => { if (screen === "meet_kit" && !kitStarted) startKitChat(); }, [screen]);

  const sendKitMessage = async (textArg?: string) => {
    const text = (textArg ?? kitInput).trim();
    if (!text || kitLoading) return;
    const userMsg = { role: "user" as const, content: text };
    const newMessages = [...kitMessages, userMsg];
    setKitMessages(newMessages);
    setKitInput("");
    setKitLoading(true);
    try {
      const formSummary = `Business: ${business?.name}, Services: ${setupServices}, Materials: ${setupProducts}, Pricing: ${setupPricing}`;
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 800, system: KIT_CONVERSATION_PROMPT, messages: [{ role: "user", content: formSummary }, ...newMessages] }),
      });
      const data = await response.json();
      const reply = data.content[0].text.trim();
      if (reply.includes("READY_TO_BUILD")) {
        const cleanReply = reply.replace("READY_TO_BUILD", "").trim();
        const finalMessages = cleanReply ? [...newMessages, { role: "assistant" as const, content: cleanReply }] : newMessages;
        setKitMessages(finalMessages);
        setKitReady(true); // fill the progress bar to 100% before building
        setKitLoading(false);
        setTimeout(() => buildSchema(finalMessages), 500);
        return;
      } else {
        setKitMessages([...newMessages, { role: "assistant", content: reply }]);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch {
      setKitMessages([...newMessages, { role: "assistant", content: "Something went wrong. Try that again." }]);
    }
    setKitLoading(false);
  };

  const primaryColor = business?.brand?.primaryColor || B.blue;
  const secondaryColor = business?.brand?.secondaryColor || B.cyan;
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "superadmin";

  // Reps must never reach Settings — bounce them to the dashboard if they somehow land there.
  useEffect(() => {
    if (screen === "settings" && currentUser && !isAdmin) setScreen("done");
  }, [screen, isAdmin, currentUser]);

  // ── SCREEN ROUTING ────────────────────────────────────────────────────────────
  if (screen === "users" && business && currentUser) return <UsersScreen business={business} currentUser={currentUser} onBack={() => setScreen("done")} />;
  if (screen === "history" && business && currentUser) return <HistoryScreen business={business} currentUser={currentUser} onBack={() => setScreen("done")} onNewQuote={() => setScreen("quote")} />;
  if (screen === "quote" && business && currentUser) return <QuoteScreen schema={business.schema} setSchema={(ns) => setBusiness(b => b ? { ...b, schema: ns } : b)} business={business} currentUser={currentUser} onBack={() => setScreen("done")} isDemoMode={isDemoMode} initialValues={quoteInitialValues} />;

  // Admin-only Settings (reps are redirected by the guard above).
  if (screen === "settings" && business && currentUser && isAdmin) return (
    <SettingsScreen
      business={business}
      onPickLogo={pickImage}
      onBack={() => setScreen("done")}
      onSave={async ({ name, brand }) => {
        const updated = { ...business!, name, brand, brandConfigured: true };
        setBusiness(updated);
        await saveBusiness(updated);
      }}
    />
  );

  // ── MASTER DASHBOARD ──────────────────────────────────────────────────────────
  if (screen === "master") {
    return <MasterDashboard onSignOut={handleSignOut} onStartDemo={startDemo} />;
  }

  if (screen === "splash") {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centered}>
          <PricrLogo />
          <ActivityIndicator color={B.blue} style={{ marginTop: 24 }} />
        </View>
      </SafeAreaView>
    );
  }

  if (screen === "building") return <BuildingScreen primaryColor={primaryColor} />;

  if (screen === "done" && business && currentUser) return (
    <DoneScreen
      business={business} currentUser={currentUser} primaryColor={primaryColor} secondaryColor={secondaryColor}
      showTestPrompt={justBuilt}
      onSignOut={handleSignOut}
      onOpenQuoteTool={() => { setJustBuilt(false); setQuoteInitialValues(undefined); setScreen("quote"); }}
      onQuoteHistory={() => { setJustBuilt(false); setScreen("history"); }}
      onManageTeam={() => { setJustBuilt(false); setScreen("users"); }}
      onReconfigure={() => { setJustBuilt(false); setScreen("setup"); setKitStarted(false); setKitReady(false); setKitMessages([]); }}
      onTestQuote={() => { setJustBuilt(false); setQuoteInitialValues(sampleFieldValues(business.schema)); setScreen("quote"); }}
      onDismissTestPrompt={() => setJustBuilt(false)}
      onOpenSettings={() => { setJustBuilt(false); setScreen("settings"); }}
    />
  );

  if (screen === "meet_kit") return (
    <MeetKitScreen
      primaryColor={primaryColor} backgroundColor={business?.brand?.backgroundColor} messages={kitMessages} input={kitInput} loading={kitLoading}
      progress={kitReady ? 1 : Math.min(0.9, kitMessages.length * 0.12)}
      onInputChange={setKitInput} onSend={() => sendKitMessage()} onQuickReply={(t) => sendKitMessage(t)} scrollRef={scrollRef}
    />
  );

  if (screen === "setup") return (
    <SetupScreen
      business={business} primaryColor={primaryColor}
      services={setupServices} products={setupProducts} pricing={setupPricing}
      onServicesChange={setSetupServices} onProductsChange={setSetupProducts} onPricingChange={setSetupPricing}
      onContinue={() => { if (!setupServices.trim() || !setupPricing.trim()) return; setScreen("meet_kit"); }}
    />
  );

  if (screen === "signup_brand") return (
    <SignupBrandScreen
      brand={signupBrand} bizName={signupBizName} onBrandChange={setSignupBrand}
      onPickLogo={pickLogo} onCreateAccount={(bc) => handleSignUp(bc)} onBack={() => setScreen("signup")}
    />
  );

  if (screen === "signup") return (
    <SignupScreen
      bizName={signupBizName} name={authName} pin={authPin} error={authError}
      onBizNameChange={setSignupBizName} onNameChange={setAuthName} onPinChange={setAuthPin}
      onBack={() => { setAuthError(""); setScreen("get_started"); }}
      onContinue={() => {
        if (!signupBizName.trim() || !authName.trim() || !authPin.trim()) { setAuthError("Please fill in all fields."); return; }
        if (authPin.length < 4) { setAuthError("PIN must be at least 4 digits."); return; }
        setAuthError("");
        setScreen("signup_brand");
      }}
    />
  );

  if (screen === "login") return (
    <LoginScreen
      code={authCode} pin={authPin} error={authError}
      onCodeChange={v => setAuthCode(v.toUpperCase())} onPinChange={setAuthPin}
      onBack={() => { setAuthError(""); setScreen("welcome"); }} onSignIn={handleAdminLogin}
    />
  );

  if (screen === "rep_join") return (
    <RepJoinScreen
      name={authName} code={authCode} error={authError}
      onNameChange={setAuthName} onCodeChange={v => setAuthCode(v.toUpperCase())}
      onBack={() => { setAuthError(""); setScreen("get_started"); }} onJoin={handleRepJoin}
    />
  );

  if (screen === "get_started") return (
    <GetStartedScreen
      onCreateBusiness={() => { setAuthError(""); setSignupBizName(""); setAuthName(""); setAuthPin(""); setSignupBrand({ ...DEFAULT_BRAND }); setScreen("signup"); }}
      onJoinAsRep={() => { setAuthError(""); setAuthName(""); setAuthCode(""); setScreen("rep_join"); }}
      onBack={() => setScreen("welcome")}
    />
  );

  // ── WELCOME ───────────────────────────────────────────────────────────────────
  return (
    <WelcomeScreen
      onLogoTap={handleLogoTap}
      onGetStarted={() => { setAuthError(""); setScreen("get_started"); }}
      onSignIn={() => { setAuthError(""); setAuthCode(""); setAuthPin(""); setScreen("login"); }}
      showMasterEntry={showMasterEntry}
      masterInput={masterInput}
      masterError={masterError}
      onMasterInputChange={setMasterInput}
      onMasterCancel={() => { setShowMasterEntry(false); setMasterInput(""); setMasterError(""); }}
      onMasterLogin={handleMasterLogin}
    />
  );
}
