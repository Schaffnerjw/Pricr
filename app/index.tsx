import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Platform, SafeAreaView, ScrollView, Text, View } from "react-native";
import { BrandHeader } from "../src/components/BrandHeader";
import { BuildingScreen } from "../src/screens/BuildingScreen";
import { DoneScreen } from "../src/screens/DoneScreen";
import { GetStartedScreen } from "../src/screens/GetStartedScreen";
import { API_URL, B, DEFAULT_BRAND, MASTER_CODE } from "../src/constants/brand";
import { KIT_CONVERSATION_PROMPT, SCHEMA_BUILDER_PROMPT } from "../src/constants/prompts";
import { HistoryScreen } from "../src/screens/HistoryScreen";
import { LoginScreen } from "../src/screens/LoginScreen";
import { MasterDashboard } from "../src/screens/MasterDashboard";
import { MeetKitScreen } from "../src/screens/MeetKitScreen";
import { QuoteScreen } from "../src/screens/QuoteScreen";
import { QuotesHistoryScreen } from "../src/screens/QuotesHistoryScreen";
import { RepJoinScreen } from "../src/screens/RepJoinScreen";
import { SettingsScreen } from "../src/screens/SettingsScreen";
import { SetUsernameScreen } from "../src/screens/SetUsernameScreen";
import { SetupScreen } from "../src/screens/SetupScreen";
import { SignupBrandScreen } from "../src/screens/SignupBrandScreen";
import { SignupScreen } from "../src/screens/SignupScreen";
import { UpgradePasswordScreen } from "../src/screens/UpgradePasswordScreen";
import { UsersScreen } from "../src/screens/UsersScreen";
import { WelcomeScreen } from "../src/screens/WelcomeScreen";
import { s } from "../src/styles";
import { isSupabaseConfigured } from "../src/lib/supabase";
import { addQuote, clearCurrentUser, codeToUuid, deleteBusiness, getBusiness, getCurrentUser, getStaySignedIn, getUsers, resolveBusinessCodeByUsername, runStartupMigrations, saveBusiness, saveCurrentUser, saveUsers, setStaySignedIn } from "../src/storage";
import { BrandConfig, Business, DemoBusiness, Screen, User } from "../src/types";
import { hashPin } from "../src/utils/auth";
import { isValidHex } from "../src/utils/color";
import { generateCode, parseSchemaFromResponse, parseSuggestedReplies } from "../src/utils/helpers";
import { buildSchemaSummary, sampleFieldValues, sampleQuotes } from "../src/utils/quote";

// Truly generic, trade-agnostic fallback used only when Kit's schema build genuinely fails to parse.
// Intentionally NOT a specific trade (no Christmas Lights default) — just a blank quantity × rate tool
// the owner can immediately refine via Kit.
const GENERIC_FALLBACK_SCHEMA = {
  trade: "Custom Quote",
  fields: [
    { id: "jobSize", label: "Job Size", type: "number", unit: "each", group: "dimensions", placeholder: "Enter the size or quantity" },
  ],
  pricing: { jobSizeRate: 100, minimumCharge: 0, taxRate: 0, depositPercent: 0 },
  addOns: [],
  calculation: "jobSize * jobSizeRate",
  summaryLines: [{ label: "Job ({jobSize})", value: "jobSize * jobSizeRate" }],
};

// Web image picker: a hidden <input type="file"> read as a data URL (expo-image-picker's
// native gallery flow isn't used on web). Resolves null if the user cancels.
function pickImageWeb(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

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
  const [settingsFocusTerms, setSettingsFocusTerms] = useState(false);

  const [setupServices, setSetupServices] = useState("");
  const [setupProducts, setSetupProducts] = useState("");
  const [setupPricing, setSetupPricing] = useState("");

  const [authName, setAuthName] = useState("");
  const [authUsername, setAuthUsername] = useState("");
  const [authPin, setAuthPin] = useState("");           // now a password (8+ chars); legacy accounts may have a short PIN
  const [authPinConfirm, setAuthPinConfirm] = useState(""); // confirmation field on account creation
  const [authCode, setAuthCode] = useState("");
  const [authError, setAuthError] = useState("");
  const [staySignedIn, setStayLocal] = useState(true);  // "Stay signed in on this device" — default ON
  const [isReconfiguring, setIsReconfiguring] = useState(false); // dashboard "Reconfigure with Kit" vs first-time onboarding

  const [signupBizName, setSignupBizName] = useState("");
  const [signupBrand, setSignupBrand] = useState<BrandConfig>({ ...DEFAULT_BRAND });

  const [kitMessages, setKitMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [kitReplies, setKitReplies] = useState<string[]>([]);
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
      const stay = await getStaySignedIn();
      setStayLocal(stay);
      const user = await getCurrentUser();
      if (user) {
        // "Stay signed in" off → don't auto-resume; clear the session and start at welcome (FIX 8).
        if (!stay) { await clearCurrentUser(); setTimeout(() => setScreen("welcome"), 600); return; }
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
    if (Platform.OS === "web") return pickImageWeb();
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
    if (!signupBizName.trim() || !authName.trim() || !authUsername.trim() || !authPin.trim()) { setAuthError("Please fill in all fields."); return; }
    if (authPin.length < 8) { setAuthError("Password must be at least 8 characters."); return; }
    if (authPin !== authPinConfirm) { setAuthError("Passwords don't match."); return; }
    const finalColor = isValidHex(signupBrand.primaryColor) ? signupBrand.primaryColor : "#2979FF";
    try {
      const code = generateCode();
      const username = authUsername.trim();
      const adminPinHash = await hashPin(username, authPin);
      const user: User = { id: Date.now().toString(), name: authName, role: "admin", businessCode: code, username, pinHash: adminPinHash };
      const biz: Business = {
        code, name: signupBizName, ownerName: authName, adminPin: "", username, adminPinHash,
        brand: { ...signupBrand, primaryColor: finalColor },
        schema: null, createdAt: Date.now(), brandConfigured,
      };
      await saveBusiness(biz);
      await saveUsers(code, [user]);
      await saveCurrentUser(user);
      await setStaySignedIn(true); setStayLocal(true);
      setCurrentUser(user);
      setBusiness(biz);
      setAuthError("");
      setIsReconfiguring(false);
      setScreen("setup");
    } catch { setAuthError("Something went wrong. Try again."); }
  };

  // Username+PIN login (also supports a Business-ID fallback for legacy accounts). Resolves the
  // business, verifies the hashed PIN for the admin OR the matching rep, and logs that user in.
  const handleLogin = async (mode: "username" | "code") => {
    setAuthError("");
    try {
      let code: string | null;
      if (mode === "username") {
        if (!authUsername.trim() || !authPin) { setAuthError("Enter your username and password."); return; }
        code = await resolveBusinessCodeByUsername(authUsername);
        if (!code) { setAuthError("No account found for that username."); return; }
      } else {
        if (!authCode.trim() || !authPin) { setAuthError("Enter your Business ID and password."); return; }
        code = authCode.toUpperCase();
      }
      const biz = await getBusiness(code);
      if (!biz) { setAuthError("Account not found."); return; }
      const users = await getUsers(biz.code);
      let user: User | undefined;
      let ok = false;
      const uname = authUsername.trim().toLowerCase();
      if (mode === "username" && (biz.username || "").toLowerCase() !== uname) {
        // A rep is signing in.
        const m = users.find(u => (u.username || "").toLowerCase() === uname);
        if (m?.pinHash) ok = (await hashPin(m.username!, authPin)) === m.pinHash;
        user = m;
      } else {
        // Admin (username match, or Business-ID mode).
        if (biz.adminPinHash && biz.username) ok = (await hashPin(biz.username, authPin)) === biz.adminPinHash;
        else if (biz.adminPin) ok = biz.adminPin === authPin; // legacy plaintext
        user = users.find(u => u.role === "admin") ?? { id: Date.now().toString(), name: biz.ownerName, role: "admin", businessCode: biz.code, username: biz.username };
      }
      if (!ok || !user) { setAuthError("Incorrect username or password."); return; }
      const legacyShortPin = authPin.length < 8; // signed in with an old short PIN → must upgrade
      await saveCurrentUser(user);
      await setStaySignedIn(staySignedIn); setStayLocal(staySignedIn);
      setCurrentUser(user);
      setBusiness(biz);
      setAuthError("");
      // Legacy account with no username yet → prompt to create one (+ password) now.
      if (!biz.username) { setAuthUsername(""); setAuthPin(""); setAuthPinConfirm(""); setScreen("set_username"); return; }
      // Existing PIN users: prompt to upgrade to a proper password on next login (FIX 9).
      if (legacyShortPin) { setAuthPin(""); setAuthPinConfirm(""); setScreen("upgrade_password"); return; }
      setScreen("done");
    } catch { setAuthError("Something went wrong. Try again."); }
  };

  // Legacy migration: a logged-in admin without a username picks one (+ password) here.
  const handleSetUsername = async () => {
    if (!business) return;
    if (!authUsername.trim()) { setAuthError("Choose a username."); return; }
    if (authPin.length < 8) { setAuthError("Password must be at least 8 characters."); return; }
    if (authPin !== authPinConfirm) { setAuthError("Passwords don't match."); return; }
    try {
      const username = authUsername.trim();
      const adminPinHash = await hashPin(username, authPin);
      const updated: Business = { ...business, username, adminPinHash, adminPin: "" };
      await saveBusiness(updated);
      const users = await getUsers(updated.code);
      const newUsers = users.map(u => u.role === "admin" ? { ...u, username, pinHash: adminPinHash } : u);
      await saveUsers(updated.code, newUsers);
      const admin = newUsers.find(u => u.role === "admin");
      if (admin) { await saveCurrentUser(admin); setCurrentUser(admin); }
      setBusiness(updated);
      setAuthError("");
      setScreen("done");
    } catch { setAuthError("Something went wrong. Try again."); }
  };

  const handleRepJoin = async () => {
    if (!authName.trim() || !authCode.trim() || !authUsername.trim() || !authPin) { setAuthError("Fill in every field."); return; }
    if (authPin.length < 8) { setAuthError("Password must be at least 8 characters."); return; }
    if (authPin !== authPinConfirm) { setAuthError("Passwords don't match."); return; }
    try {
      const biz = await getBusiness(authCode.toUpperCase());
      if (!biz) { setAuthError("Business ID not found. Check with your admin."); return; }
      const users = await getUsers(biz.code);
      const uname = authUsername.trim();
      if ((biz.username || "").toLowerCase() === uname.toLowerCase() || users.some(u => (u.username || "").toLowerCase() === uname.toLowerCase())) {
        setAuthError("That username is taken. Choose another."); return;
      }
      const pinHash = await hashPin(uname, authPin);
      const user: User = { id: Date.now().toString(), name: authName, role: "rep", businessCode: biz.code, username: uname, pinHash };
      users.push(user);
      await saveUsers(biz.code, users);
      await saveCurrentUser(user);
      await setStaySignedIn(true); setStayLocal(true);
      setCurrentUser(user);
      setBusiness(biz);
      setAuthError("");
      setScreen("done");
    } catch { setAuthError("Something went wrong. Try again."); }
  };

  // Existing PIN user upgrades to a proper 8+ char password (FIX 9). Re-hashes for the right principal
  // (admin → the business adminPinHash + admin member; rep → their own member row), then continues.
  const handleUpgradePassword = async () => {
    if (!business || !currentUser) return;
    if (authPin.length < 8) { setAuthError("Password must be at least 8 characters."); return; }
    if (authPin !== authPinConfirm) { setAuthError("Passwords don't match."); return; }
    try {
      const uname = currentUser.username || business.username;
      if (!uname) { setAuthError(""); setScreen("done"); return; }
      const newHash = await hashPin(uname, authPin);
      const users = await getUsers(business.code);
      if (currentUser.role === "rep") {
        const newUsers = users.map(u => u.id === currentUser.id ? { ...u, pinHash: newHash } : u);
        await saveUsers(business.code, newUsers);
        const me = newUsers.find(u => u.id === currentUser.id);
        if (me) { await saveCurrentUser(me); setCurrentUser(me); }
      } else {
        const updated: Business = { ...business, adminPinHash: newHash, adminPin: "" };
        await saveBusiness(updated);
        const newUsers = users.map(u => u.role === "admin" ? { ...u, pinHash: newHash } : u);
        await saveUsers(business.code, newUsers);
        setBusiness(updated);
        const admin = newUsers.find(u => u.role === "admin");
        if (admin) { await saveCurrentUser(admin); setCurrentUser(admin); }
      }
      setAuthPin(""); setAuthPinConfirm(""); setAuthError("");
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
    setIsReconfiguring(false);
    setScreen("done"); // land on the dashboard first (FIX 23); "Open My Quote Tool" enters the tool
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
      const { content, replies } = parseSuggestedReplies(data.content[0].text.trim());
      setKitMessages([{ role: "assistant", content }]);
      setKitReplies(replies);
      setKitStarted(true);
    } catch {
      setKitMessages([{ role: "assistant", content: "Hey, good to meet you. What is the main way you measure or size a job?" }]);
      setKitStarted(true);
    }
    setKitLoading(false);
  };

  const buildSchema = async (conversation: { role: "user" | "assistant"; content: string }[]) => {
    setScreen("building");
    const fallbackSchema: any = GENERIC_FALLBACK_SCHEMA;
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
    // Don't let a cloud hiccup strand onboarding on the building screen — the schema is in memory
    // and the business already exists from signup; persist best-effort and continue to the dashboard.
    try { await saveBusiness(updatedBiz); } catch (e) { console.warn("[buildSchema] cloud save failed (schema kept locally):", e instanceof Error ? e.message : String(e)); }
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
    setKitReplies([]);
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
        const { content: cleanReply } = parseSuggestedReplies(reply.replace("READY_TO_BUILD", "").trim());
        const finalMessages = cleanReply ? [...newMessages, { role: "assistant" as const, content: cleanReply }] : newMessages;
        setKitMessages(finalMessages);
        setKitReady(true); // fill the progress bar to 100% before building
        setKitLoading(false);
        setTimeout(() => buildSchema(finalMessages), 500);
        return;
      } else {
        const { content, replies } = parseSuggestedReplies(reply);
        setKitMessages([...newMessages, { role: "assistant", content }]);
        setKitReplies(replies);
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
  if (screen === "pipeline" && business && currentUser) return <QuotesHistoryScreen businessId={codeToUuid(business.code)} isAdmin={isAdmin} accentColor={primaryColor} backgroundColor={business.brand.backgroundColor} termsAndConditions={business.termsAndConditions} onBack={() => setScreen("done")} />;
  if (screen === "quote" && business && currentUser) return <QuoteScreen schema={business.schema} setSchema={(ns) => setBusiness(b => b ? { ...b, schema: ns } : b)} business={business} currentUser={currentUser} onBack={() => setScreen("done")} isDemoMode={isDemoMode} initialValues={quoteInitialValues} />;

  // Admin-only Settings (reps are redirected by the guard above).
  if (screen === "settings" && business && currentUser && isAdmin) return (
    <SettingsScreen
      business={business}
      currentUser={currentUser}
      onPickLogo={pickImage}
      onSignOut={handleSignOut}
      scrollToTerms={settingsFocusTerms}
      onBack={() => { setSettingsFocusTerms(false); setScreen("done"); }}
      onSave={async ({ name, brand, termsAndConditions, docPrefs, paymentMethods }) => {
        const updated = { ...business!, name, brand, brandConfigured: true, termsAndConditions, docPrefs, paymentMethods };
        await saveBusiness(updated); // throws on failure → SettingsScreen surfaces it; local state only updates on success
        setBusiness(updated);
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
          <Image source={require("../assets/images/icon.png")} style={{ width: 200, height: 200 }} resizeMode="contain" />
          <ActivityIndicator color={B.blue} style={{ marginTop: 24 }} />
        </View>
      </SafeAreaView>
    );
  }

  if (screen === "building") return <BuildingScreen primaryColor={primaryColor} />;

  if (screen === "done" && business && currentUser) return (
    <DoneScreen
      business={business} currentUser={currentUser} primaryColor={primaryColor} secondaryColor={secondaryColor}
      showTestPrompt={justBuilt} isDemoMode={isDemoMode}
      onOpenQuoteTool={() => { setJustBuilt(false); setQuoteInitialValues(undefined); setScreen("quote"); }}
      onQuoteHistory={() => { setJustBuilt(false); setScreen("history"); }}
      onQuotePipeline={isSupabaseConfigured && !isDemoMode ? () => { setJustBuilt(false); setScreen("pipeline"); } : undefined}
      onManageTeam={() => { setJustBuilt(false); setScreen("users"); }}
      onReconfigure={() => { setJustBuilt(false); setIsReconfiguring(true); setScreen("setup"); setKitStarted(false); setKitReady(false); setKitMessages([]); }}
      onTestQuote={() => { setJustBuilt(false); setQuoteInitialValues(sampleFieldValues(business.schema)); setScreen("quote"); }}
      onDismissTestPrompt={() => setJustBuilt(false)}
      onOpenSettings={() => { setJustBuilt(false); setSettingsFocusTerms(false); setScreen("settings"); }}
      onSetupTerms={() => { setJustBuilt(false); setSettingsFocusTerms(true); setScreen("settings"); }}
    />
  );

  if (screen === "meet_kit") return (
    <MeetKitScreen
      primaryColor={primaryColor} backgroundColor={business?.brand?.backgroundColor} messages={kitMessages} input={kitInput} loading={kitLoading} chips={kitReplies}
      progress={kitReady ? 1 : Math.min(0.9, kitMessages.length * 0.12)}
      onInputChange={setKitInput} onSend={() => sendKitMessage()} onQuickReply={(t) => sendKitMessage(t)} scrollRef={scrollRef}
      isReconfiguring={isReconfiguring}
      onCancel={() => { setIsReconfiguring(false); setScreen("done"); }}
    />
  );

  if (screen === "setup") return (
    <SetupScreen
      business={business} primaryColor={primaryColor}
      services={setupServices} products={setupProducts} pricing={setupPricing}
      onServicesChange={setSetupServices} onProductsChange={setSetupProducts} onPricingChange={setSetupPricing}
      onContinue={() => { if (!setupServices.trim() || !setupPricing.trim()) return; setScreen("meet_kit"); }}
      isReconfiguring={isReconfiguring}
      onCancel={() => { setIsReconfiguring(false); setScreen("done"); }}
    />
  );

  if (screen === "signup_brand") return (
    <SignupBrandScreen
      brand={signupBrand} bizName={signupBizName} onBrandChange={setSignupBrand}
      onPickLogo={pickLogo} onCreateAccount={(bc) => handleSignUp(bc)} onBack={() => setScreen("signup")}
    />
  );

  if (screen === "set_username" && business && currentUser) return (
    <SetUsernameScreen
      username={authUsername} pin={authPin} confirm={authPinConfirm} error={authError}
      onUsernameChange={setAuthUsername} onPinChange={setAuthPin} onConfirmChange={setAuthPinConfirm} onSave={handleSetUsername}
    />
  );

  if (screen === "upgrade_password" && business && currentUser) return (
    <UpgradePasswordScreen
      username={currentUser.username || business.username || ""}
      pin={authPin} confirm={authPinConfirm} error={authError}
      onPinChange={setAuthPin} onConfirmChange={setAuthPinConfirm} onSave={handleUpgradePassword}
    />
  );

  if (screen === "signup") return (
    <SignupScreen
      bizName={signupBizName} name={authName} username={authUsername} pin={authPin} confirm={authPinConfirm} error={authError}
      onBizNameChange={setSignupBizName} onNameChange={setAuthName} onUsernameChange={setAuthUsername} onPinChange={setAuthPin} onConfirmChange={setAuthPinConfirm}
      onBack={() => { setAuthError(""); setScreen("get_started"); }}
      onContinue={() => {
        if (!signupBizName.trim() || !authName.trim() || !authUsername.trim() || !authPin.trim()) { setAuthError("Please fill in all fields."); return; }
        if (authPin.length < 8) { setAuthError("Password must be at least 8 characters."); return; }
        if (authPin !== authPinConfirm) { setAuthError("Passwords don't match."); return; }
        setAuthError("");
        setScreen("signup_brand");
      }}
    />
  );

  if (screen === "login") return (
    <LoginScreen
      username={authUsername} code={authCode} pin={authPin} error={authError}
      staySignedIn={staySignedIn} onToggleStay={setStayLocal}
      onUsernameChange={setAuthUsername} onCodeChange={v => setAuthCode(v.toUpperCase())} onPinChange={setAuthPin}
      onBack={() => { setAuthError(""); setScreen("welcome"); }} onSignIn={handleLogin}
    />
  );

  if (screen === "rep_join") return (
    <RepJoinScreen
      name={authName} code={authCode} username={authUsername} pin={authPin} confirm={authPinConfirm} error={authError}
      onNameChange={setAuthName} onCodeChange={v => setAuthCode(v.toUpperCase())} onUsernameChange={setAuthUsername} onPinChange={setAuthPin} onConfirmChange={setAuthPinConfirm}
      onBack={() => { setAuthError(""); setScreen("get_started"); }} onJoin={handleRepJoin}
    />
  );

  if (screen === "get_started") return (
    <GetStartedScreen
      onCreateBusiness={() => { setAuthError(""); setSignupBizName(""); setAuthName(""); setAuthUsername(""); setAuthPin(""); setAuthPinConfirm(""); setSignupBrand({ ...DEFAULT_BRAND }); setScreen("signup"); }}
      onJoinAsRep={() => { setAuthError(""); setAuthName(""); setAuthUsername(""); setAuthPin(""); setAuthPinConfirm(""); setAuthCode(""); setScreen("rep_join"); }}
      onBack={() => setScreen("welcome")}
    />
  );

  // ── WELCOME ───────────────────────────────────────────────────────────────────
  return (
    <WelcomeScreen
      onLogoTap={handleLogoTap}
      onGetStarted={() => { setAuthError(""); setScreen("get_started"); }}
      onSignIn={() => { setAuthError(""); setAuthUsername(""); setAuthCode(""); setAuthPin(""); setAuthPinConfirm(""); setScreen("login"); }}
      showMasterEntry={showMasterEntry}
      masterInput={masterInput}
      masterError={masterError}
      onMasterInputChange={setMasterInput}
      onMasterCancel={() => { setShowMasterEntry(false); setMasterInput(""); setMasterError(""); }}
      onMasterLogin={handleMasterLogin}
    />
  );
}
