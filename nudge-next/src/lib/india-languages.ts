export const INDIAN_LANGUAGES = [
  { code: "en", label: "English", nativeLabel: "English", script: "Latin" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", script: "Devanagari" },
  { code: "ta", label: "Tamil", nativeLabel: "தமிழ்", script: "Tamil" },
  { code: "te", label: "Telugu", nativeLabel: "తెలుగు", script: "Telugu" },
  { code: "gu", label: "Gujarati", nativeLabel: "ગુજરાતી", script: "Gujarati" },
  { code: "mr", label: "Marathi", nativeLabel: "मराठी", script: "Devanagari" },
  { code: "pa", label: "Punjabi", nativeLabel: "ਪੰਜਾਬੀ", script: "Gurmukhi" },
  { code: "kn", label: "Kannada", nativeLabel: "ಕನ್ನಡ", script: "Kannada" },
  { code: "ml", label: "Malayalam", nativeLabel: "മലയാളം", script: "Malayalam" },
  { code: "bn", label: "Bengali", nativeLabel: "বাংলা", script: "Bengali" },
  { code: "ur", label: "Urdu", nativeLabel: "اردو", script: "Arabic" },
] as const;

export type IndianLanguageCode = (typeof INDIAN_LANGUAGES)[number]["code"];

export const DEFAULT_LANGUAGE: IndianLanguageCode = "en";

export const INDIAN_LANGUAGE_LABELS: Record<IndianLanguageCode, string> =
  Object.fromEntries(
    INDIAN_LANGUAGES.map((language) => [
      language.code,
      `${language.label} (${language.nativeLabel})`,
    ]),
  ) as Record<IndianLanguageCode, string>;

const LANGUAGE_CODES = new Set<string>(
  INDIAN_LANGUAGES.map((language) => language.code),
);

export function normalizeLanguageCode(
  value: string | null | undefined,
): IndianLanguageCode {
  const code = String(value ?? "").trim().toLowerCase();
  return LANGUAGE_CODES.has(code) ? (code as IndianLanguageCode) : DEFAULT_LANGUAGE;
}

export function languageName(code: string | null | undefined): string {
  return INDIAN_LANGUAGE_LABELS[normalizeLanguageCode(code)];
}

export function languageInstruction(code: string | null | undefined): string {
  const language = INDIAN_LANGUAGES.find(
    (item) => item.code === normalizeLanguageCode(code),
  )!;
  if (language.code === "en") {
    return "Write in clear Indian English. Keep the tone conversational for WhatsApp.";
  }
  return `Write in ${language.label} using ${language.script} script. Do not transliterate into English unless the customer mixed English in their message. Keep the tone natural for Indian WhatsApp conversations.`;
}

const SCRIPT_RANGES: Array<[IndianLanguageCode, RegExp]> = [
  ["ta", /[\u0B80-\u0BFF]/],
  ["te", /[\u0C00-\u0C7F]/],
  ["gu", /[\u0A80-\u0AFF]/],
  ["pa", /[\u0A00-\u0A7F]/],
  ["kn", /[\u0C80-\u0CFF]/],
  ["ml", /[\u0D00-\u0D7F]/],
  ["bn", /[\u0980-\u09FF]/],
  ["ur", /[\u0600-\u06FF]/],
];

export function detectIndianLanguage(
  text: string | null | undefined,
): IndianLanguageCode {
  const value = String(text ?? "");
  for (const [code, pattern] of SCRIPT_RANGES) {
    if (pattern.test(value)) return code;
  }
  if (/[\u0900-\u097F]/.test(value)) {
    // Marathi and Hindi share Devanagari. Bias to Hindi unless there are common
    // Marathi terms that make the safer product response Marathi.
    if (/(आहे|कृपया|मला|तुम्ही|नाही|होय|किंमत|बुकिंग)/.test(value)) return "mr";
    return "hi";
  }
  return DEFAULT_LANGUAGE;
}

type IntentCopy = {
  greeting: string;
  price: string;
  booking: string;
  support: string;
  handoff: string;
  lost: string;
  payment: string;
  cancel: string;
};

export const REGIONAL_REPLY_COPY: Record<IndianLanguageCode, IntentCopy> = {
  en: {
    greeting: "Hi! I can help. What are you looking for today?",
    price: "Sure, I can share pricing. Could you tell me what option you are interested in?",
    booking: "Sure, I can help with booking. Please share your preferred date and time.",
    support: "Happy to help. Please share a few details so I can guide you.",
    handoff: "I am connecting you to a team member who can help with this.",
    lost: "No problem. I will not follow up further unless you ask.",
    payment: "Sure, I can help with payment. I will share the secure next step.",
    cancel: "No problem. Please share your booking details so I can check it.",
  },
  hi: {
    greeting: "नमस्ते! मैं मदद कर सकता हूँ। आप आज किस बारे में जानकारी चाहते हैं?",
    price: "ज़रूर, मैं कीमत की जानकारी साझा कर सकता हूँ। आप किस विकल्प में रुचि रखते हैं?",
    booking: "ज़रूर, मैं बुकिंग में मदद कर सकता हूँ। कृपया अपनी पसंद की तारीख और समय बताएं।",
    support: "मदद करके खुशी होगी। कृपया कुछ जानकारी साझा करें ताकि मैं सही मार्गदर्शन दे सकूँ।",
    handoff: "मैं आपको टीम के सदस्य से जोड़ रहा हूँ जो इसमें बेहतर मदद कर पाएंगे।",
    lost: "कोई बात नहीं। जब तक आप न कहें, हम आगे फॉलो-अप नहीं करेंगे।",
    payment: "ज़रूर, मैं भुगतान में मदद कर सकता हूँ। मैं सुरक्षित अगला कदम साझा करता हूँ।",
    cancel: "कोई बात नहीं। कृपया अपनी बुकिंग जानकारी साझा करें ताकि मैं जांच सकूँ।",
  },
  ta: {
    greeting: "வணக்கம்! உதவ மகிழ்ச்சி. இன்று எந்த விவரம் வேண்டும்?",
    price: "சரி, விலை விவரத்தை பகிரலாம். எந்த விருப்பத்தில் ஆர்வம் உள்ளது?",
    booking: "சரி, முன்பதிவில் உதவுகிறேன். உங்களுக்கு ஏற்ற தேதி மற்றும் நேரத்தை பகிரவும்.",
    support: "உதவ மகிழ்ச்சி. சரியாக வழிகாட்ட சில விவரங்களை பகிரவும்.",
    handoff: "இதில் சிறப்பாக உதவக்கூடிய எங்கள் குழு உறுப்பினரிடம் உங்களை இணைக்கிறேன்.",
    lost: "பரவாயில்லை. நீங்கள் கேட்கும் வரை மேலும் தொடர்பு கொள்ள மாட்டோம்.",
    payment: "சரி, கட்டணத்தில் உதவுகிறேன். பாதுகாப்பான அடுத்த படியை பகிர்கிறேன்.",
    cancel: "பரவாயில்லை. உங்கள் முன்பதிவு விவரங்களை பகிரவும்; நான் சரிபார்க்கிறேன்.",
  },
  te: {
    greeting: "నమస్తే! నేను సహాయం చేయగలను. ఈ రోజు మీకు ఏ సమాచారం కావాలి?",
    price: "తప్పకుండా, ధర వివరాలు చెబుతాను. మీరు ఏ ఎంపికపై ఆసక్తి చూపుతున్నారు?",
    booking: "తప్పకుండా, బుకింగ్‌లో సహాయం చేస్తాను. మీకు అనుకూలమైన తేదీ మరియు సమయం చెప్పండి.",
    support: "సహాయం చేస్తాను. సరైన మార్గదర్శనం కోసం కొన్ని వివరాలు పంచండి.",
    handoff: "ఇందులో బాగా సహాయం చేయగల మా టీమ్ సభ్యునితో మిమ్మల్ని కలుపుతున్నాను.",
    lost: "పర్లేదు. మీరు అడిగే వరకు మేము మళ్లీ ఫాలోఅప్ చేయము.",
    payment: "తప్పకుండా, చెల్లింపులో సహాయం చేస్తాను. సురక్షితమైన తదుపరి దశను పంచుతాను.",
    cancel: "పర్లేదు. మీ బుకింగ్ వివరాలు పంపండి; నేను పరిశీలిస్తాను.",
  },
  gu: {
    greeting: "નમસ્તે! હું મદદ કરી શકું છું. આજે તમને કઈ માહિતી જોઈએ છે?",
    price: "ચોક્કસ, હું કિંમતની માહિતી શેર કરી શકું છું. તમને કયા વિકલ્પમાં રસ છે?",
    booking: "ચોક્કસ, બુકિંગમાં મદદ કરું છું. કૃપા કરીને તમારી પસંદની તારીખ અને સમય જણાવો.",
    support: "મદદ કરીને આનંદ થશે. યોગ્ય માર્ગદર્શન માટે કૃપા કરીને કેટલીક વિગતો આપો.",
    handoff: "આમાં સારી રીતે મદદ કરી શકે એવા અમારી ટીમના સભ્ય સાથે તમને જોડું છું.",
    lost: "કોઈ વાંધો નહીં. તમે કહો ત્યાં સુધી અમે વધુ ફોલો-અપ નહીં કરીએ.",
    payment: "ચોક્કસ, પેમેન્ટમાં મદદ કરું છું. સુરક્ષિત આગળનું પગલું શેર કરું છું.",
    cancel: "કોઈ વાંધો નહીં. કૃપા કરીને તમારી બુકિંગ વિગતો આપો જેથી હું તપાસી શકું.",
  },
  mr: {
    greeting: "नमस्कार! मी मदत करू शकतो. आज तुम्हाला कोणती माहिती हवी आहे?",
    price: "नक्की, मी किंमतीची माहिती देऊ शकतो. तुम्हाला कोणत्या पर्यायात रस आहे?",
    booking: "नक्की, बुकिंगमध्ये मदत करतो. कृपया तुमची पसंतीची तारीख आणि वेळ सांगा.",
    support: "मदत करायला आनंद होईल. योग्य मार्गदर्शनासाठी काही तपशील शेअर करा.",
    handoff: "या बाबतीत मदत करू शकणाऱ्या आमच्या टीम सदस्याशी तुम्हाला जोडत आहे.",
    lost: "काही हरकत नाही. तुम्ही सांगितल्याशिवाय आम्ही पुढे फॉलो-अप करणार नाही.",
    payment: "नक्की, पेमेंटमध्ये मदत करतो. सुरक्षित पुढील पाऊल शेअर करतो.",
    cancel: "काही हरकत नाही. कृपया तुमचे बुकिंग तपशील शेअर करा म्हणजे मी तपासू शकतो.",
  },
  pa: {
    greeting: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ। ਅੱਜ ਤੁਹਾਨੂੰ ਕਿਹੜੀ ਜਾਣਕਾਰੀ ਚਾਹੀਦੀ ਹੈ?",
    price: "ਜ਼ਰੂਰ, ਮੈਂ ਕੀਮਤ ਦੀ ਜਾਣਕਾਰੀ ਸਾਂਝੀ ਕਰ ਸਕਦਾ ਹਾਂ। ਤੁਸੀਂ ਕਿਹੜੇ ਵਿਕਲਪ ਵਿੱਚ ਰੁਚੀ ਰੱਖਦੇ ਹੋ?",
    booking: "ਜ਼ਰੂਰ, ਮੈਂ ਬੁਕਿੰਗ ਵਿੱਚ ਮਦਦ ਕਰਾਂਗਾ। ਆਪਣੀ ਪਸੰਦ ਦੀ ਤਾਰੀਖ ਅਤੇ ਸਮਾਂ ਦੱਸੋ।",
    support: "ਮਦਦ ਕਰਕੇ ਖੁਸ਼ੀ ਹੋਵੇਗੀ। ਸਹੀ ਰਾਹਨੁਮਾਈ ਲਈ ਕੁਝ ਵੇਰਵੇ ਸਾਂਝੇ ਕਰੋ।",
    handoff: "ਮੈਂ ਤੁਹਾਨੂੰ ਸਾਡੀ ਟੀਮ ਦੇ ਮੈਂਬਰ ਨਾਲ ਜੋੜ ਰਿਹਾ ਹਾਂ ਜੋ ਇਸ ਵਿੱਚ ਮਦਦ ਕਰੇਗਾ।",
    lost: "ਕੋਈ ਗੱਲ ਨਹੀਂ। ਜਦ ਤੱਕ ਤੁਸੀਂ ਨਾ ਕਹੋ, ਅਸੀਂ ਅੱਗੇ ਫਾਲੋ-ਅੱਪ ਨਹੀਂ ਕਰਾਂਗੇ।",
    payment: "ਜ਼ਰੂਰ, ਮੈਂ ਭੁਗਤਾਨ ਵਿੱਚ ਮਦਦ ਕਰਾਂਗਾ। ਸੁਰੱਖਿਅਤ ਅਗਲਾ ਕਦਮ ਸਾਂਝਾ ਕਰਦਾ ਹਾਂ।",
    cancel: "ਕੋਈ ਗੱਲ ਨਹੀਂ। ਆਪਣੀ ਬੁਕਿੰਗ ਜਾਣਕਾਰੀ ਭੇਜੋ ਤਾਂ ਜੋ ਮੈਂ ਜਾਂਚ ਸਕਾਂ।",
  },
  kn: {
    greeting: "ನಮಸ್ಕಾರ! ನಾನು ಸಹಾಯ ಮಾಡುತ್ತೇನೆ. ಇಂದು ನಿಮಗೆ ಯಾವ ಮಾಹಿತಿ ಬೇಕು?",
    price: "ಖಂಡಿತ, ಬೆಲೆ ವಿವರಗಳನ್ನು ಹಂಚಬಹುದು. ನಿಮಗೆ ಯಾವ ಆಯ್ಕೆಯಲ್ಲಿ ಆಸಕ್ತಿ ಇದೆ?",
    booking: "ಖಂಡಿತ, ಬುಕ್ಕಿಂಗ್‌ಗೆ ಸಹಾಯ ಮಾಡುತ್ತೇನೆ. ನಿಮಗೆ ಅನುಕೂಲವಾದ ದಿನಾಂಕ ಮತ್ತು ಸಮಯ ತಿಳಿಸಿ.",
    support: "ಸಹಾಯ ಮಾಡಲು ಸಂತೋಷ. ಸರಿಯಾಗಿ ಮಾರ್ಗದರ್ಶನಕ್ಕೆ ಕೆಲವು ವಿವರಗಳನ್ನು ಹಂಚಿ.",
    handoff: "ಇದರಲ್ಲಿ ಉತ್ತಮವಾಗಿ ಸಹಾಯ ಮಾಡುವ ನಮ್ಮ ತಂಡದ ಸದಸ್ಯರ ಜೊತೆ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತೇನೆ.",
    lost: "ಸರಿ. ನೀವು ಕೇಳುವವರೆಗೆ ನಾವು ಮತ್ತೆ ಫಾಲೋ-ಅಪ್ ಮಾಡುವುದಿಲ್ಲ.",
    payment: "ಖಂಡಿತ, ಪಾವತಿಯಲ್ಲಿ ಸಹಾಯ ಮಾಡುತ್ತೇನೆ. ಸುರಕ್ಷಿತ ಮುಂದಿನ ಹಂತವನ್ನು ಹಂಚುತ್ತೇನೆ.",
    cancel: "ಸರಿ. ನಿಮ್ಮ ಬುಕ್ಕಿಂಗ್ ವಿವರಗಳನ್ನು ಹಂಚಿ; ನಾನು ಪರಿಶೀಲಿಸುತ್ತೇನೆ.",
  },
  ml: {
    greeting: "നമസ്കാരം! സഹായിക്കാം. ഇന്ന് നിങ്ങള്‍ക്ക് ഏത് വിവരം വേണം?",
    price: "തീർച്ചയായും, വില വിവരങ്ങൾ പങ്കിടാം. ഏത് ഓപ്ഷനിലാണ് താൽപ്പര്യം?",
    booking: "തീർച്ചയായും, ബുക്കിംഗിൽ സഹായിക്കാം. ഇഷ്ടപ്പെട്ട തീയതിയും സമയവും പങ്കിടൂ.",
    support: "സഹായിക്കാൻ സന്തോഷം. ശരിയായി ഗൈഡ് ചെയ്യാൻ കുറച്ച് വിവരങ്ങൾ പങ്കിടൂ.",
    handoff: "ഇതിൽ മികച്ച സഹായം നൽകാൻ കഴിയുന്ന ഞങ്ങളുടെ ടീം അംഗവുമായി നിങ്ങളെ ബന്ധിപ്പിക്കുന്നു.",
    lost: "പ്രശ്നമില്ല. നിങ്ങൾ ആവശ്യപ്പെടുന്നതുവരെ ഇനി ഫോളോ-അപ്പ് ചെയ്യില്ല.",
    payment: "തീർച്ചയായും, പേയ്മെന്റിൽ സഹായിക്കാം. സുരക്ഷിതമായ അടുത്ത ഘട്ടം പങ്കിടാം.",
    cancel: "പ്രശ്നമില്ല. നിങ്ങളുടെ ബുക്കിംഗ് വിവരങ്ങൾ പങ്കിടൂ; ഞാൻ പരിശോധിക്കാം.",
  },
  bn: {
    greeting: "নমস্কার! আমি সাহায্য করতে পারি। আজ আপনি কোন তথ্য চান?",
    price: "নিশ্চয়ই, আমি দামের তথ্য জানাতে পারি। আপনি কোন বিকল্পে আগ্রহী?",
    booking: "নিশ্চয়ই, বুকিংয়ে সাহায্য করব। আপনার পছন্দের তারিখ ও সময় জানান।",
    support: "সাহায্য করতে ভালো লাগবে। সঠিকভাবে গাইড করতে কিছু তথ্য শেয়ার করুন।",
    handoff: "এ বিষয়ে ভালোভাবে সাহায্য করতে পারবেন এমন আমাদের টিম সদস্যের সঙ্গে আপনাকে যুক্ত করছি।",
    lost: "কোনো সমস্যা নেই। আপনি না বললে আমরা আর ফলো-আপ করব না।",
    payment: "নিশ্চয়ই, পেমেন্টে সাহায্য করব। নিরাপদ পরবর্তী ধাপ শেয়ার করছি।",
    cancel: "কোনো সমস্যা নেই। আপনার বুকিং তথ্য শেয়ার করুন, আমি দেখে নিচ্ছি।",
  },
  ur: {
    greeting: "السلام علیکم! میں مدد کر سکتا ہوں۔ آج آپ کو کس معلومات کی ضرورت ہے؟",
    price: "ضرور، میں قیمت کی معلومات دے سکتا ہوں۔ آپ کس آپشن میں دلچسپی رکھتے ہیں؟",
    booking: "ضرور، میں بکنگ میں مدد کرتا ہوں۔ اپنی پسند کی تاریخ اور وقت بتائیں۔",
    support: "مدد کر کے خوشی ہوگی۔ درست رہنمائی کے لیے کچھ تفصیلات شیئر کریں۔",
    handoff: "میں آپ کو ہماری ٹیم کے رکن سے جوڑ رہا ہوں جو اس میں بہتر مدد کر سکیں گے۔",
    lost: "کوئی مسئلہ نہیں۔ جب تک آپ نہ کہیں، ہم مزید فالو اپ نہیں کریں گے۔",
    payment: "ضرور، میں ادائیگی میں مدد کرتا ہوں۔ محفوظ اگلا قدم شیئر کرتا ہوں۔",
    cancel: "کوئی مسئلہ نہیں۔ اپنی بکنگ کی تفصیلات شیئر کریں تاکہ میں چیک کر سکوں۔",
  },
};
