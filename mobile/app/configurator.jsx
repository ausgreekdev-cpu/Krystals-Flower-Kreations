import { useEffect } from 'react';
import { ScrollView, View, Text, Pressable, TextInput, Switch } from 'react-native';
import { useConfiguratorStore, estimateLocalPrice } from '../core/store/configuratorStore';
import { ordersApi } from '../core/api/customClient';

const TEXTURES = ['textured', 'smooth', 'pearl', 'linen'];
const WEIGHTS = ['65lb', '80lb', '110lb'];
const COLORS = ['Blush', 'Sage', 'Ivory', 'Dusty Pink', 'Eucalyptus', 'Paper White'];
const TEMPLATES = [
  { id: 'wattle-sprig', label: 'Wattle Sprig' },
  { id: 'paper-rose', label: 'Paper Rose' },
  { id: 'banksia-petal', label: 'Banksia Petal' },
  { id: 'origami-lily', label: 'Origami Lily' },
  { id: 'peony-bloom', label: 'Peony Bloom' },
];

export default function Configurator() {
  const { spec, unitPrice, totalPrice, estimatedMinutes, setSpec, setPricing } = useConfiguratorStore();

  useEffect(() => {
    const est = estimateLocalPrice(spec);
    setPricing(est);
  }, [spec]);

  async function submit() {
    try {
      const order = await ordersApi.customCreate({
        customerEmail: 'guest@krystal.local',
        customerName: 'Perth Customer',
        spec,
        shippingPostcode: '6000',
      });
      alert(`Draft created — ${order.orderNumber} — ${order.state} — est ${order.estimatedMinutes}m — $${order.totalPrice}`);
    } catch (e) {
      alert(`Need backend: ${e.message}`);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#FFF7F0' }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: '#4A2C2A' }}>Custom Bouquet Configurator</Text>
      <Text style={{ color: '#6B4A4A' }}>Paper colour, texture, weight • stem count • armature height • Cricut template — real-time price + Perth studio ETA.</Text>

      {/* Colour */}
      <Section title="1 · Paper Colour">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {COLORS.map(c => (
            <Chip key={c} label={c} active={spec.paperColor === c} onPress={() => setSpec({ paperColor: c })} />
          ))}
        </View>
      </Section>

      {/* Texture & Weight */}
      <Section title="2 · Texture & Weight">
        <Text style={{ color: '#6B4A4A', fontSize: 12 }}>Texture — Perth humidity tip: textured holds curl longer</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          {TEXTURES.map(t => <Chip key={t} label={t} active={spec.paperTexture === t} onPress={() => setSpec({ paperTexture: t })} />)}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          {WEIGHTS.map(w => <Chip key={w} label={w} active={spec.weight === w} onPress={() => setSpec({ weight: w })} />)}
        </View>
      </Section>

      {/* Stem count & armature */}
      <Section title="3 · Stems & Armature">
        <Row label="Stem count">
          <Stepper value={spec.stemCount} min={1} max={25} onChange={(v) => setSpec({ stemCount: v })} />
        </Row>
        <Row label="Armature height (mm)">
          <Stepper value={spec.armatureHeightMm} min={150} max={600} step={50} onChange={(v) => setSpec({ armatureHeightMm: v })} />
        </Row>
        <Row label="Add greenery (eucalyptus)">
          <Switch value={spec.addGreenery} onValueChange={(v) => setSpec({ addGreenery: v })} />
        </Row>
        <Row label="Include vase (+$22)">
          <Switch value={spec.vaseIncluded} onValueChange={(v) => setSpec({ vaseIncluded: v })} />
        </Row>
      </Section>

      {/* Template */}
      <Section title="4 · Cricut Precision Template">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TEMPLATES.map(t => (
            <Chip key={t.id} label={t.label} active={spec.templateId === t.id} onPress={() => setSpec({ templateId: t.id })} />
          ))}
        </View>
        <View style={{ marginTop: 12, backgroundColor: '#FDE8E0', borderRadius: 12, padding: 12, alignItems: 'center' }}>
          <Text style={{ color: '#4A2C2A', fontWeight: '700' }}>{TEMPLATES.find(t=>t.id===spec.templateId)?.label} — SVG preview</Text>
          <Text style={{ color: '#6B4A4A', fontSize: 12, marginTop: 4 }}>Cricut cut lines overlaid on {spec.paperColor} {spec.weight} {spec.paperTexture} paper</Text>
          <View style={{ marginTop: 8, width: '100%', height: 80, borderRadius: 8, backgroundColor: '#E8CFCF', borderWidth: 1, borderColor: '#D6A8A8', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#4A2C2A' }}>✂ Preview: {spec.paperColor} • {spec.paperTexture} • {spec.weight}</Text>
          </View>
        </View>
      </Section>

      {/* Notes */}
      <Section title="Notes (optional)">
        <TextInput value={spec.notes} onChangeText={(v) => setSpec({ notes: v })} placeholder="e.g., Dusty pink + sage for wedding table — Perth delivery Fri" multiline style={{ backgroundColor: 'white', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E8CFCF', minHeight: 60 }} />
      </Section>

      {/* Live pricing card */}
      <View style={{ backgroundColor: '#4A2C2A', borderRadius: 16, padding: 16 }}>
        <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>Live Quote — Perth Studio (GST-inclusive)</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
          <Text style={{ color: 'white', opacity: 0.8 }}>Unit</Text><Text style={{ color: 'white', fontWeight: '800' }}>${unitPrice.toFixed(2)} AUD</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <Text style={{ color: 'white', opacity: 0.8 }}>Total ({spec.stemCount} stems)</Text><Text style={{ color: 'white', fontWeight: '800' }}>${totalPrice.toFixed(2)}</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <Text style={{ color: 'white', opacity: 0.8 }}>Est. craft time</Text><Text style={{ color: 'white', fontWeight: '700' }}>{estimatedMinutes} min</Text>
        </View>
        <Text style={{ color: 'white', opacity: 0.6, fontSize: 11, marginTop: 8 }}>BOM + labour $55/hr + 30% studio margin. Tap to start order.</Text>
        <Pressable onPress={submit} style={{ backgroundColor: '#B85C5C', marginTop: 12, paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}>
          <Text style={{ color: 'white', fontWeight: '800' }}>Create Custom Order → Drafting/Proofing</Text>
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
