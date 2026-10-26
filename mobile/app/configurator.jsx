import { useEffect, useState, useRef } from 'react';
import { ScrollView, View, Text, Pressable, TextInput, Switch, Image, ActivityIndicator } from 'react-native';
import { useConfiguratorStore, estimateLocalPrice } from '../core/store/configuratorStore';
import { ordersApi, paperStocksApi } from '../core/api/customClient';

const BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

const TEXTURES = ['textured', 'smooth', 'pearl', 'linen'];
const WEIGHTS = ['65lb', '80lb', '110lb'];
const COLORS = ['Blush', 'Sage', 'Ivory', 'Dusty Pink', 'Eucalyptus', 'Paper White'];
const TEMPLATES = [
  { id: 'wattle-sprig', label: 'Wattle Sprig', flowerType: 'wattle', description: 'Golden sprigs — light, airy native charm' },
  { id: 'paper-rose', label: 'Paper Rose', flowerType: 'rose', description: 'Classic full bloom — romantic and timeless' },
  { id: 'banksia-petal', label: 'Banksia Petal', flowerType: 'banksia', description: 'Sculptural cones — bold Australian texture' },
  { id: 'origami-lily', label: 'Origami Lily', flowerType: 'lily', description: 'Crisp geometric petals — modern statement' },
];

export default function Configurator() {
  const { spec, unitPrice, totalPrice, setSpec, setPricing } = useConfiguratorStore();
  const [papers, setPapers] = useState([]);
  const [paperQ, setPaperQ] = useState('');
  const [paperZoom, setPaperZoom] = useState(null);

  // Lead days — default 7, overridden by admin setting public custom_order_lead_days
  const [leadDays, setLeadDays] = useState(7);
  useEffect(() => {
    fetch(`${BASE}/api/settings`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const raw = d?.custom_order_lead_days ?? d?.settings?.custom_order_lead_days ?? d?.custom_order_lead_days;
        if (raw != null && Number(raw) > 0) setLeadDays(Number(raw));
      })
      .catch(() => {});
  }, []);
  const minNeededBy = (() => {
    const d = new Date();
    d.setDate(d.getDate() + leadDays);
    return d.toISOString().slice(0, 10);
  })();

  useEffect(() => { paperStocksApi.list(spec.templateId).then(setPapers).catch(() => {}); }, [spec.templateId]);
  const selectedPaper = papers.find((p) => p.id === spec.paperStockId) || null;
  const paperPremium = selectedPaper ? Number(selectedPaper.pricePremiumPerStem) || 0 : 0;
  const availablePapers = papers.filter((p) => Number(p.onHand) > 0);
  const filteredPapers = availablePapers.filter((p) => {
    const q = paperQ.trim().toLowerCase();
    if (!q) return true;
    return [p.name, p.colour, p.paperType, p.weight].some((v) => String(v || '').toLowerCase().includes(q));
  });
  useEffect(() => { if (spec.paperStockId && !availablePapers.find((p) => p.id === spec.paperStockId)) setSpec({ paperStockId: null }); }, [availablePapers.map((p) => p.id).join(','), spec.paperStockId]);

  // Live quote — POST /api/configurator/quote debounced 400ms, fallback to estimateLocalPrice
  const [quoted, setQuoted] = useState(null);
  const [quoteFailed, setQuoteFailed] = useState(false);
  useEffect(() => {
    const id = setTimeout(async () => {
      try {
        const body = {
          paperColor: spec.paperColor,
          paperTexture: spec.paperTexture,
          weight: spec.weight,
          stemCount: spec.stemCount,
          heightMm: spec.heightMm,
          templateId: spec.templateId,
          addGreenery: spec.addGreenery,
          vaseIncluded: spec.vaseIncluded,
          domeIncluded: spec.domeIncluded,
          ledIncluded: spec.ledIncluded,
          palette: spec.palette,
          paperStockId: spec.paperStockId,
          notes: spec.notes,
        };
        const res = await fetch(`${BASE}/api/configurator/quote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('quote failed');
        const data = await res.json();
        setQuoted(data);
        setQuoteFailed(false);
        if (typeof data.total === 'number') {
          const est = estimateLocalPrice(spec, paperPremium);
          setPricing({ unitPrice: data.total, totalPrice: data.total, estimatedMinutes: data.estimatedMinutes ?? est.estimatedMinutes });
        }
      } catch {
        setQuoted(null);
        setQuoteFailed(true);
        const est = estimateLocalPrice(spec, paperPremium);
        setPricing(est);
      }
    }, 400);
    return () => clearTimeout(id);
  }, [JSON.stringify(spec), paperPremium]);

  const estimate = estimateLocalPrice(spec, paperPremium);
  const displayTotal = quoted && typeof quoted.total === 'number' ? quoted.total : estimate.totalPrice;
  const isLiveQuote = quoted && !quoteFailed && typeof quoted.total === 'number';

  // Form state — no defaults, all required except phone/neededBy
  const [form, setForm] = useState({ name: '', email: '', postcode: '', phone: '', fulfilment: 'pickup', neededBy: '' });
  const [fieldErrs, setFieldErrs] = useState({});
  const [formErr, setFormErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);

  // Pairs cross-sell
  const [pairs, setPairs] = useState([]);
  const [pairBusy, setPairBusy] = useState('');
  const [pairMsg, setPairMsg] = useState('');
  useEffect(() => {
    setPairs([]); setPairMsg('');
    const ft = TEMPLATES.find((t) => t.id === spec.templateId)?.flowerType;
    if (!ft) return;
    let alive = true;
    fetch(`${BASE}/api/products?flowerType=${encodeURIComponent(ft)}&limit=6`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const arr = Array.isArray(d) ? d : Array.isArray(d?.products) ? d.products : [];
        if (alive) setPairs(arr.slice(0, 3));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [spec.templateId]);
  async function addPair(p) {
    setPairBusy(p.id); setPairMsg('');
    try {
      const { cartApi } = await import('../core/api/customClient');
      // fallback to direct fetch if cartApi not suitable
      const res = await fetch(`${BASE}/api/cart/add`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: p.id, quantity: 1 }) });
      if (!res.ok) throw new Error('Could not add');
      setPairMsg(`${p.title} added to cart`);
    } catch (e) { setPairMsg(e.message || 'Could not add — try the product page'); }
    finally { setPairBusy(''); }
  }

  // Single idempotency key per draft — generate once, regenerate only after successful submit
  const idempotencyKeyRef = useRef(null);
  if (idempotencyKeyRef.current === null) {
    idempotencyKeyRef.current = (globalThis.crypto?.randomUUID?.() || `kfk-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  }

  async function submit() {
    setFormErr(''); setFieldErrs({});
    const errs = {};
    const name = form.name.trim();
    const email = form.email.trim();
    const postcode = form.postcode.trim();
    const phone = form.phone.trim();
    if (!name || name.length < 2) errs.name = 'Full name required (at least 2 characters)';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Valid email required';
    if (!postcode || !/^\d{4}$/.test(postcode)) errs.postcode = 'Postcode must be 4 digits (e.g. 6000)';
    if (phone && phone.length > 30) errs.phone = 'Phone must be 30 characters or less';
    if (!['pickup', 'post'].includes(form.fulfilment)) errs.fulfilment = 'Choose pickup or post';
    if (form.neededBy) {
      const minD = new Date(minNeededBy); minD.setHours(0, 0, 0, 0);
      const nd = new Date(form.neededBy); nd.setHours(0, 0, 0, 0);
      if (Number.isNaN(nd.getTime())) errs.neededBy = 'Enter a valid date (YYYY-MM-DD)';
      else if (nd < minD) errs.neededBy = `Needed-by must be at least ${leadDays} days from today (${minNeededBy})`;
    }
    if (Object.keys(errs).length) { setFieldErrs(errs); setFormErr('Please check the highlighted fields.'); return; }
    setSubmitting(true);
    try {
      const neededBy = form.neededBy ? new Date(form.neededBy).toISOString() : null;
      const order = await ordersApi.customCreate({
        customerEmail: email,
        customerName: name,
        customerPhone: phone || null,
        spec: { ...spec },
        shippingPostcode: postcode,
        shippingName: name,
        fulfilment: form.fulfilment,
        neededBy,
      }, undefined, idempotencyKeyRef.current);
      setSuccess(order);
      // regenerate key only after successful submit
      idempotencyKeyRef.current = (globalThis.crypto?.randomUUID?.() || `kfk-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    } catch (e) {
      setFormErr(e.message || 'Failed — please try again');
    } finally {
      setSubmitting(false);
    }
  }

  function resetSuccess() {
    setSuccess(null);
    setForm({ name: '', email: '', postcode: '', phone: '', fulfilment: 'pickup', neededBy: '' });
    setFieldErrs({}); setFormErr('');
  }

  // Success confirmation view — no alert() with internal data
  if (success) {
    const totalNum = Number(success.totalPrice);
    const statusLink = success.statusToken ? `${BASE}/custom-order/status/${success.statusToken}` : (success.statusUrl || null);
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#FFF7F0' }} contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: '#4A2C2A' }}>Custom Bouquet Configurator</Text>
        <View style={{ backgroundColor: 'white', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#E8CFCF', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#4A2C2A', textAlign: 'center' }}>Thanks — your design is with Krystal!</Text>
          <Text style={{ color: '#4A2C2A', textAlign: 'center' }}>Order <Text style={{ fontWeight: '800' }}>{success.orderNumber}</Text></Text>
          <Text style={{ color: '#4A2C2A', textAlign: 'center' }}>Total (GST incl.): <Text style={{ fontWeight: '800', color: '#B85C5C' }}>${Number.isFinite(totalNum) ? totalNum.toFixed(2) : displayTotal.toFixed(2)} AUD</Text> — price includes GST.</Text>
          <View style={{ backgroundColor: '#FFF7F0', borderRadius: 12, padding: 12, width: '100%', borderWidth: 1, borderColor: '#E8CFCF' }}>
            <Text style={{ fontWeight: '700', color: '#4A2C2A', fontSize: 12 }}>Next steps</Text>
            <Text style={{ color: '#6B4A4A', fontSize: 12, marginTop: 4 }}>Krystal will review your design and be in touch from Perth within 1–2 business days with a proof and next steps. Your bouquet will be ready in about {leadDays} days.</Text>
          </View>
          <View style={{ backgroundColor: '#4A2C2A', borderRadius: 12, padding: 12, width: '100%' }}>
            <Text style={{ color: 'white', fontWeight: '700', fontSize: 12 }}>Deposit & payment</Text>
            <Text style={{ color: 'white', opacity: 0.85, fontSize: 12, marginTop: 4 }}>Deposit instructions will be included in your confirmation email. The studio will confirm your total and next steps — please check your email for the invoice and bank transfer details (or pickup instructions).</Text>
            {success.paymentStatus ? <Text style={{ color: 'white', opacity: 0.7, fontSize: 11, marginTop: 6 }}>Payment status: {success.paymentStatus}</Text> : null}
          </View>
          {statusLink ? (
            <View style={{ width: '100%', backgroundColor: '#FFF7F0', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E8CFCF' }}>
              <Text style={{ fontSize: 12, color: '#4A2C2A' }}>Track your order:</Text>
              <Text style={{ fontSize: 12, color: '#B85C5C', marginTop: 4 }} selectable>{statusLink}</Text>
            </View>
          ) : null}
          <Text style={{ color: '#4A2C2A', fontWeight: '700', fontSize: 12, textAlign: 'center' }}>Please check your email — your confirmation has been sent.</Text>
          <Pressable onPress={resetSuccess} style={{ backgroundColor: '#B85C5C', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, alignItems: 'center', width: '100%', marginTop: 4 }}>
            <Text style={{ color: 'white', fontWeight: '800' }}>Start a new design</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#FFF7F0' }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: '#4A2C2A' }}>Custom Bouquet Configurator</Text>
      <Text style={{ color: '#6B4A4A' }}>Paper colour, texture, weight • stem count • structure height • template — live price (GST incl.) • Ready in about {leadDays} days.</Text>

      {/* 1 · Flower style — step 1 (web parity) */}
      <Section title="1 · Flower style — choose the bloom">
        <Text style={{ color: '#6B4A4A', fontSize: 12 }}>The bloom that guides your bouquet.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {TEMPLATES.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => setSpec({ templateId: t.id })}
              style={{
                width: '48%',
                borderWidth: spec.templateId === t.id ? 2 : 1,
                borderColor: spec.templateId === t.id ? '#B85C5C' : '#E8CFCF',
                borderRadius: 12,
                overflow: 'hidden',
                backgroundColor: 'white',
              }}
            >
              <Image
                source={{ uri: `${BASE}/flowers/${t.id}.jpg` }}
                style={{ width: '100%', height: 90, backgroundColor: '#FDE8E0' }}
                resizeMode="cover"
              />
              <View style={{ padding: 8 }}>
                <Text style={{ fontWeight: '700', fontSize: 12, color: '#4A2C2A' }}>{t.label}</Text>
                <Text style={{ fontSize: 11, color: '#6B4A4A', marginTop: 2 }}>{t.description}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </Section>

      {/* 2 · Papers — sellable materials — only available */}
      {availablePapers.length > 0 ? (
        <Section title={`2 · Paper — pick colour & type ${paperPremium > 0 ? `+${paperPremium.toFixed(2)}/stem` : ''}`}>
          <TextInput value={paperQ} onChangeText={setPaperQ} placeholder="Search papers…" style={{ backgroundColor: 'white', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#E8CFCF', marginBottom: 8 }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {filteredPapers.map((p) => (
              <Pressable key={p.id} onPress={() => setSpec({ paperStockId: p.id, paperColor: p.colour, paperTexture: p.texture, weight: p.weight })} style={{ width: '48%', borderWidth: spec.paperStockId === p.id ? 2 : 1, borderColor: spec.paperStockId === p.id ? '#B85C5C' : '#E8CFCF', borderRadius: 12, overflow: 'hidden', backgroundColor: 'white', opacity: p.onHand <= (p.lowThreshold ?? 5) ? 0.85 : 1 }}>
                {p.imageUrl ? <Image source={{ uri: p.imageUrl }} style={{ width: '100%', height: 80 }} /> : <View style={{ height: 80, backgroundColor: p.colourHex || '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}><Text>{p.colour}</Text></View>}
                <View style={{ padding: 8 }}>
                  <Text style={{ fontWeight: '700', fontSize: 12, color: '#4A2C2A' }}>{p.name}</Text>
                  <Text style={{ fontSize: 11, color: '#6B4A4A' }}>{p.paperType} • {p.texture} • {p.weight}</Text>
                  <Text style={{ fontSize: 11, color: Number(p.pricePremiumPerStem) > 0 ? '#B85C5C' : '#6B4A4A' }}>{Number(p.pricePremiumPerStem) > 0 ? `+${Number(p.pricePremiumPerStem).toFixed(2)}/stem` : 'included'} {p.onHand <= (p.lowThreshold ?? 5) ? '• low' : ''}</Text>
                </View>
              </Pressable>
            ))}
          </View>
          {selectedPaper && <Text style={{ fontSize: 11, color: '#6B4A4A', marginTop: 8 }}>Selected: {selectedPaper.name} — +{paperPremium.toFixed(2)}/stem × {spec.stemCount} = +{(paperPremium * spec.stemCount).toFixed(2)}</Text>}
          <Pressable onPress={() => setSpec({ paperStockId: null })} style={{ marginTop: 8, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: '#E8CFCF', backgroundColor: !spec.paperStockId ? '#B85C5C' : 'white' }}><Text style={{ color: !spec.paperStockId ? 'white' : '#4A2C2A', fontSize: 12 }}>No paper premium</Text></Pressable>
          <View style={{ marginTop: 10, backgroundColor: '#FFF7F0', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#E8CFCF' }}>
            <Text style={{ fontWeight: '700', fontSize: 12, color: '#4A2C2A' }}>Price breakdown</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}><Text style={{ fontSize: 12, color: '#6B4A4A' }}>Floor (45 + {spec.stemCount}×9.50)</Text><Text style={{ fontSize: 12 }}>{(45 + spec.stemCount * 9.5).toFixed(2)}</Text></View>
            {paperPremium > 0 && <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontSize: 12, color: '#6B4A4A' }}>Paper premium</Text><Text style={{ fontSize: 12, color: '#B85C5C' }}>+{(paperPremium * spec.stemCount).toFixed(2)}</Text></View>}
            {(spec.addGreenery || spec.vaseIncluded || spec.domeIncluded || spec.ledIncluded) && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontSize: 12, color: '#6B4A4A' }}>Add-ons</Text><Text style={{ fontSize: 12 }}>+{((spec.addGreenery ? 12 : 0) + (spec.vaseIncluded ? 22 : 0) + (spec.domeIncluded ? 45 : 0) + (spec.ledIncluded ? 18 : 0)).toFixed(2)}</Text></View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}><Text style={{ fontWeight: '700', fontSize: 12 }}>Total (GST incl.)</Text><Text style={{ fontWeight: '700', fontSize: 12 }}>${displayTotal.toFixed(2)} AUD {isLiveQuote ? '' : '(est.)'}</Text></View>
            <Text style={{ fontSize: 11, color: '#6B4A4A', marginTop: 4 }}>All prices in AUD, GST inclusive. {isLiveQuote ? 'Live quote.' : 'Estimate — final price confirmed at proofing.'}</Text>
          </View>
        </Section>
      ) : papers.length > 0 ? (
        <Section title="Papers out of stock">
          <Text style={{ color: '#6B4A4A', fontSize: 12 }}>All uploaded papers are currently out of stock — check back soon or contact the studio.</Text>
        </Section>
      ) : (
        <>
          <Section title="2 · Paper Colour">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {COLORS.map((c) => (
                <Chip key={c} label={c} active={spec.paperColor === c} onPress={() => setSpec({ paperColor: c })} />
              ))}
            </View>
          </Section>
          <Section title="Texture & Weight">
            <Text style={{ color: '#6B4A4A', fontSize: 12 }}>Texture — Perth humidity tip: textured holds curl longer</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {TEXTURES.map((t) => <Chip key={t} label={t} active={spec.paperTexture === t} onPress={() => setSpec({ paperTexture: t })} />)}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {WEIGHTS.map((w) => <Chip key={w} label={w} active={spec.weight === w} onPress={() => setSpec({ weight: w })} />)}
            </View>
          </Section>
        </>
      )}

      {/* 3 · Stem count & height */}
      <Section title="3 · Stems & Height">
        <Row label="Stem count">
          <Stepper value={spec.stemCount} min={1} max={25} onChange={(v) => setSpec({ stemCount: v })} />
        </Row>
        <Row label="Height (mm)">
          <Stepper value={spec.heightMm} min={150} max={600} step={50} onChange={(v) => setSpec({ heightMm: v })} />
        </Row>
        <Row label="Add greenery (eucalyptus) +$12">
          <Switch value={spec.addGreenery} onValueChange={(v) => setSpec({ addGreenery: v })} />
        </Row>
        <Row label="Include vase +$22">
          <Switch value={spec.vaseIncluded} onValueChange={(v) => setSpec({ vaseIncluded: v })} />
        </Row>
        <Row label="Glass dome +$45">
          <Switch value={spec.domeIncluded} onValueChange={(v) => setSpec({ domeIncluded: v })} />
        </Row>
        <Row label="LED lights +$18">
          <Switch value={spec.ledIncluded} onValueChange={(v) => setSpec({ ledIncluded: v })} />
        </Row>
      </Section>

      {/* Preview */}
      <Section title="Preview">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TEMPLATES.map((t) => (
            <Chip key={t.id} label={t.label} active={spec.templateId === t.id} onPress={() => setSpec({ templateId: t.id })} />
          ))}
        </View>
        <Pressable onPress={() => selectedPaper?.imageUrl && setPaperZoom(selectedPaper)} style={{ marginTop: 12, borderRadius: 12, padding: 12, alignItems: 'center', backgroundColor: selectedPaper?.colourHex || '#FDE8E0', borderWidth: 1, borderColor: '#E8CFCF', overflow: 'hidden' }}>
          <Text style={{ color: '#4A2C2A', fontWeight: '700' }}>{TEMPLATES.find((t) => t.id === spec.templateId)?.label} — preview</Text>
          <Text style={{ color: '#4A2C2A', fontSize: 12, marginTop: 4 }}>{selectedPaper ? `${selectedPaper.name} • ${selectedPaper.texture}` : `${spec.paperColor} ${spec.weight} ${spec.paperTexture}`} paper {selectedPaper?.imageUrl ? '• tap to zoom' : ''} {selectedPaper?.texture ? `• ${selectedPaper.texture}` : ''}</Text>
          <View style={{ marginTop: 8, width: '100%', height: 100, borderRadius: 8, backgroundColor: selectedPaper?.imageUrl ? 'white' : '#E8CFCF', borderWidth: 1, borderColor: '#D6A8A8', overflow: 'hidden', position: 'relative' }}>
            {selectedPaper?.imageUrl ? <Image source={{ uri: selectedPaper.imageUrl }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.35 }} resizeMode="repeat" /> : null}
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: selectedPaper?.imageUrl ? 'rgba(255,255,255,0.35)' : 'transparent' }}>
              <Text style={{ color: '#4A2C2A', fontWeight: '700' }}>{TEMPLATES.find((t) => t.id === spec.templateId)?.label}</Text>
              <Text style={{ color: '#6B4A4A', fontSize: 11, marginTop: 2 }}>{selectedPaper ? `${selectedPaper.paperType} ${selectedPaper.weight} • ${selectedPaper.texture}` : `${spec.paperColor} • ${spec.paperTexture} • ${spec.weight}`}</Text>
            </View>
          </View>
        </Pressable>
        {paperZoom && (
          <Pressable onPress={() => setPaperZoom(null)} style={{ marginTop: 10, backgroundColor: 'white', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#E8CFCF' }}>
            <Image source={{ uri: paperZoom.imageUrl }} style={{ width: '100%', height: 260 }} resizeMode="contain" />
            <View style={{ padding: 12 }}>
              <Text style={{ fontWeight: '700', color: '#4A2C2A' }}>{paperZoom.name}</Text>
              <Text style={{ fontSize: 12, color: '#6B4A4A', marginTop: 2 }}>{paperZoom.colour} • {paperZoom.paperType} • {paperZoom.texture} • {paperZoom.weight} • +${Number(paperZoom.pricePremiumPerStem).toFixed(2)}/stem</Text>
              <Pressable onPress={() => setPaperZoom(null)} style={{ marginTop: 10, backgroundColor: '#4A2C2A', padding: 10, borderRadius: 12, alignItems: 'center' }}><Text style={{ color: 'white', fontWeight: '700' }}>Close</Text></Pressable>
            </View>
          </Pressable>
        )}
      </Section>

      {/* Notes */}
      <Section title="Notes (optional)">
        <TextInput value={spec.notes} onChangeText={(v) => setSpec({ notes: v })} placeholder="e.g. Dusty pink + sage for wedding table — Perth delivery Fri" multiline style={{ backgroundColor: 'white', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E8CFCF', minHeight: 60 }} />
      </Section>

      {/* Pairs cross-sell */}
      {pairs.length > 0 ? (
        <Section title={`Pairs well with — ${TEMPLATES.find((t) => t.id === spec.templateId)?.flowerType || ''} blooms`}>
          {pairMsg ? <Text style={{ fontSize: 11, color: '#2E7D32', marginBottom: 6 }}>{pairMsg}</Text> : null}
          <View style={{ gap: 8 }}>
            {pairs.map((p) => (
              <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF7F0', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#E8CFCF' }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontWeight: '700', fontSize: 12, color: '#4A2C2A' }}>{p.title}</Text>
                  <Text style={{ fontSize: 11, color: '#B85C5C', marginTop: 2 }}>${Number(p.price).toFixed(2)} AUD</Text>
                </View>
                <Pressable onPress={() => addPair(p)} disabled={pairBusy === p.id} style={{ backgroundColor: pairBusy === p.id ? '#9CA3AF' : '#B85C5C', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center' }}>
                  <Text style={{ color: 'white', fontWeight: '700', fontSize: 12 }}>{pairBusy === p.id ? 'Adding…' : 'Add to cart'}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {/* Your details */}
      <Section title="Your details — for custom order">
        <Text style={{ fontSize: 12, color: '#6B4A4A', marginBottom: 6 }}>We’ll use these to confirm your proof and delivery/pickup.</Text>
        <View style={{ gap: 8 }}>
          <Text style={{ fontWeight: '700', fontSize: 12, color: '#4A2C2A' }}>Full name *</Text>
          <TextInput value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Full name" style={{ backgroundColor: 'white', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: fieldErrs.name ? '#DC2626' : '#E8CFCF' }} autoCapitalize="words" />
          {fieldErrs.name ? <Text style={{ fontSize: 11, color: '#DC2626' }}>{fieldErrs.name}</Text> : null}

          <Text style={{ fontWeight: '700', fontSize: 12, color: '#4A2C2A', marginTop: 4 }}>Email *</Text>
          <TextInput value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" style={{ backgroundColor: 'white', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: fieldErrs.email ? '#DC2626' : '#E8CFCF' }} />
          {fieldErrs.email ? <Text style={{ fontSize: 11, color: '#DC2626' }}>{fieldErrs.email}</Text> : null}

          <Text style={{ fontWeight: '700', fontSize: 12, color: '#4A2C2A', marginTop: 4 }}>Postcode *</Text>
          <TextInput value={form.postcode} onChangeText={(v) => setForm({ ...form, postcode: v })} placeholder="6000" keyboardType="number-pad" maxLength={4} style={{ backgroundColor: 'white', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: fieldErrs.postcode ? '#DC2626' : '#E8CFCF' }} />
          {fieldErrs.postcode ? <Text style={{ fontSize: 11, color: '#DC2626' }}>{fieldErrs.postcode}</Text> : null}

          <Text style={{ fontWeight: '700', fontSize: 12, color: '#4A2C2A', marginTop: 4 }}>Phone (optional)</Text>
          <TextInput value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} placeholder="Phone (optional)" keyboardType="phone-pad" style={{ backgroundColor: 'white', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: fieldErrs.phone ? '#DC2626' : '#E8CFCF' }} />
          {fieldErrs.phone ? <Text style={{ fontSize: 11, color: '#DC2626' }}>{fieldErrs.phone}</Text> : null}

          <Text style={{ fontWeight: '700', fontSize: 12, color: '#4A2C2A', marginTop: 4 }}>Fulfilment *</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => setForm({ ...form, fulfilment: 'pickup' })} style={{ flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: 'center', borderWidth: 1, borderColor: form.fulfilment === 'pickup' ? '#B85C5C' : '#E8CFCF', backgroundColor: form.fulfilment === 'pickup' ? '#B85C5C' : 'white' }}>
              <Text style={{ color: form.fulfilment === 'pickup' ? 'white' : '#4A2C2A', fontWeight: '700', fontSize: 12 }}>Pickup — Perth studio</Text>
            </Pressable>
            <Pressable onPress={() => setForm({ ...form, fulfilment: 'post' })} style={{ flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: 'center', borderWidth: 1, borderColor: form.fulfilment === 'post' ? '#B85C5C' : '#E8CFCF', backgroundColor: form.fulfilment === 'post' ? '#B85C5C' : 'white' }}>
              <Text style={{ color: form.fulfilment === 'post' ? 'white' : '#4A2C2A', fontWeight: '700', fontSize: 12 }}>Post — delivery</Text>
            </Pressable>
          </View>
          {fieldErrs.fulfilment ? <Text style={{ fontSize: 11, color: '#DC2626' }}>{fieldErrs.fulfilment}</Text> : null}

          <Text style={{ fontWeight: '700', fontSize: 12, color: '#4A2C2A', marginTop: 4 }}>Needed by (optional) — YYYY-MM-DD</Text>
          <TextInput value={form.neededBy} onChangeText={(v) => setForm({ ...form, neededBy: v })} placeholder={minNeededBy} style={{ backgroundColor: 'white', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: fieldErrs.neededBy ? '#DC2626' : '#E8CFCF' }} />
          {fieldErrs.neededBy ? <Text style={{ fontSize: 11, color: '#DC2626' }}>{fieldErrs.neededBy}</Text> : null}
          <Text style={{ fontSize: 11, color: '#6B4A4A' }}>Earliest available date is {minNeededBy} (about {leadDays} days from today).</Text>
          {formErr ? <Text style={{ fontSize: 12, color: '#DC2626', backgroundColor: '#FEF2F2', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#FECACA' }}>{formErr}</Text> : null}
        </View>
      </Section>

      {/* Live pricing card — GST incl., Ready in N days */}
      <View style={{ backgroundColor: '#4A2C2A', borderRadius: 16, padding: 16 }}>
        <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>Live Quote — Perth Studio (GST incl.)</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
          <Text style={{ color: 'white', opacity: 0.8 }}>Total ({spec.stemCount} stems)</Text><Text style={{ color: 'white', fontWeight: '800' }}>${displayTotal.toFixed(2)} AUD</Text>
        </View>
        <Text style={{ color: 'white', opacity: 0.65, fontSize: 11, marginTop: 4 }}>GST incl. {isLiveQuote ? 'Live quote' : 'Estimate — final price confirmed at proofing.'}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          <Text style={{ color: 'white', opacity: 0.8, fontSize: 12 }}>Ready in about {leadDays} days</Text><Text style={{ color: 'white', opacity: 0.6, fontSize: 11 }}>{isLiveQuote ? 'Live quote' : 'Estimate'}</Text>
        </View>
        <Text style={{ color: 'white', opacity: 0.6, fontSize: 11, marginTop: 8 }}>All prices in AUD, GST inclusive. Floor $45 + $9.50/stem + add-ons (+$12 greenery / +$22 vase / +$45 dome / +$18 LED) + paper premium.</Text>
        <Pressable onPress={submit} disabled={submitting} style={{ backgroundColor: submitting ? '#8A4444' : '#B85C5C', marginTop: 12, paddingVertical: 14, borderRadius: 12, alignItems: 'center', opacity: submitting ? 0.7 : 1 }}>
          {submitting ? <ActivityIndicator color="white" /> : <Text style={{ color: 'white', fontWeight: '800' }}>Create Custom Order</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Section({ title, children }) {
  return <View style={{ backgroundColor: 'white', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E8CFCF' }}><Text style={{ fontWeight: '800', color: '#4A2C2A' }}>{title}</Text><View style={{ marginTop: 10 }}>{children}</View></View>;
}
function Row({ label, children }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}><Text style={{ color: '#4A2C2A' }}>{label}</Text>{children}</View>;
}
function Chip({ label, active, onPress }) {
  return <Pressable onPress={onPress} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: active ? '#B85C5C' : 'white', borderWidth: 1, borderColor: active ? '#B85C5C' : '#E8CFCF' }}><Text style={{ color: active ? 'white' : '#4A2C2A', fontWeight: active ? '700' : '400', fontSize: 12 }}>{label}</Text></Pressable>;
}
function Stepper({ value, min, max, step = 1, onChange }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Pressable onPress={() => onChange(Math.max(min, value - step))} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFF7F0', borderWidth: 1, borderColor: '#E8CFCF', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontWeight: '800' }}>−</Text></Pressable><Text style={{ minWidth: 40, textAlign: 'center', fontWeight: '700', color: '#4A2C2A' }}>{value}</Text><Pressable onPress={() => onChange(Math.min(max, value + step))} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#B85C5C', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: 'white', fontWeight: '800' }}>+</Text></Pressable></View>;
}
