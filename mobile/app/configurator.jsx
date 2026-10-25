import { useEffect, useState } from 'react';
import { ScrollView, View, Text, Pressable, TextInput, Switch, Image } from 'react-native';
import { useConfiguratorStore, estimateLocalPrice } from '../core/store/configuratorStore';
import { ordersApi, paperStocksApi } from '../core/api/customClient';

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
  const [papers, setPapers] = useState([]);
  const [paperQ, setPaperQ] = useState('');
  const [paperZoom, setPaperZoom] = useState(null);
  useEffect(()=>{ paperStocksApi.list().then(setPapers).catch(()=>{}); }, []);
  const selectedPaper = papers.find(p=> p.id===spec.paperStockId) || null;
  const paperPremium = selectedPaper ? Number(selectedPaper.pricePremiumPerStem) || 0 : 0;
  const availablePapers = papers.filter(p=> Number(p.onHand) > 0);
  const filteredPapers = availablePapers.filter(p=> {
    const q=paperQ.trim().toLowerCase();
    if(!q) return true;
    return [p.name,p.colour,p.paperType,p.weight].some(v=> String(v||'').toLowerCase().includes(q));
  });
  useEffect(()=>{ if (spec.paperStockId && !availablePapers.find(p=> p.id===spec.paperStockId)) setSpec({ paperStockId: null }); }, [availablePapers.map(p=> p.id).join(','), spec.paperStockId]);

  useEffect(() => {
    const est = estimateLocalPrice(spec, paperPremium);
    setPricing(est);
  }, [spec, paperPremium]);

  async function submit() {
    try {
      const order = await ordersApi.customCreate({
        customerEmail: 'guest@krystal.local',
        customerName: 'Perth Customer',
        spec,
        shippingPostcode: '6000',
      });
      alert(`Draft ${order.orderNumber} — ${order.state} — $${Number(order.totalPrice).toFixed(2)} — ${order.estimatedMinutes}m — QR ${order.ticket?.qrPayload || ''}. See Kanban.`);
    } catch (e) {
      alert(`Need backend running: ${e.message}`);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#FFF7F0' }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: '#4A2C2A' }}>Custom Bouquet Configurator</Text>
      <Text style={{ color: '#6B4A4A' }}>Paper colour, texture, weight • stem count • structure height  template — real-time price + Perth studio ETA.</Text>

      {/* Papers — sellable materials — only available */}
      {availablePapers.length>0 ? (
        <Section title={`1 · Paper — pick colour & type ${paperPremium>0 ? `+${paperPremium.toFixed(2)}/stem` : ''}`}>
          <TextInput value={paperQ} onChangeText={setPaperQ} placeholder="Search papers…" style={{ backgroundColor:'white', borderRadius:12, padding:10, borderWidth:1, borderColor:'#E8CFCF', marginBottom:8 }} />
          <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8 }}>
            {filteredPapers.map(p=> (
              <Pressable key={p.id} onPress={()=> setSpec({ paperStockId:p.id, paperColor:p.colour, paperTexture:p.texture, weight:p.weight })} style={{ width:'48%', borderWidth: spec.paperStockId===p.id?2:1, borderColor: spec.paperStockId===p.id?'#B85C5C':'#E8CFCF', borderRadius:12, overflow:'hidden', backgroundColor:'white', opacity: p.onHand<= (p.lowThreshold??5) ? 0.6 : 1 }}>
                {p.imageUrl ? <Image source={{uri:p.imageUrl}} style={{width:'100%', height:80}} /> : <View style={{height:80, backgroundColor:p.colourHex||'#f3f4f6', alignItems:'center', justifyContent:'center'}}><Text>{p.colour}</Text></View>}
                <View style={{padding:8}}>
                  <Text style={{fontWeight:'700', fontSize:12, color:'#4A2C2A'}}>{p.name}</Text>
                  <Text style={{fontSize:11, color:'#6B4A4A'}}>{p.paperType} • {p.texture} • {p.weight}</Text>
                  <Text style={{fontSize:11, color: Number(p.pricePremiumPerStem)>0?'#B85C5C':'#6B4A4A'}}>{Number(p.pricePremiumPerStem)>0? `+${Number(p.pricePremiumPerStem).toFixed(2)}/stem`:'included'} {p.onHand<= (p.lowThreshold??5) ? '• low' : ''}</Text>
                </View>
              </Pressable>
            ))}
          </View>
          {selectedPaper && <Text style={{fontSize:11, color:'#6B4A4A', marginTop:8}}>Selected: {selectedPaper.name} — +{paperPremium.toFixed(2)}/stem × {spec.stemCount} = +{(paperPremium*spec.stemCount).toFixed(2)}</Text>}
          <Pressable onPress={()=> setSpec({ paperStockId:null })} style={{marginTop:8, alignSelf:'flex-start', paddingVertical:6, paddingHorizontal:12, borderRadius:999, borderWidth:1, borderColor:'#E8CFCF', backgroundColor: !spec.paperStockId?'#B85C5C':'white'}}><Text style={{color: !spec.paperStockId?'white':'#4A2C2A', fontSize:12}}>No paper premium</Text></Pressable>
          <View style={{marginTop:10, backgroundColor:'#FFF7F0', borderRadius:12, padding:10, borderWidth:1, borderColor:'#E8CFCF'}}>
            <Text style={{fontWeight:'700', fontSize:12, color:'#4A2C2A'}}>Price breakdown</Text>
            <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:4}}><Text style={{fontSize:12, color:'#6B4A4A'}}>Stems ({spec.stemCount}×9.50)</Text><Text style={{fontSize:12}}>{(spec.stemCount*9.5).toFixed(2)}</Text></View>
            {paperPremium>0 && <View style={{flexDirection:'row', justifyContent:'space-between'}}><Text style={{fontSize:12, color:'#6B4A4A'}}>Paper premium</Text><Text style={{fontSize:12, color:'#B85C5C'}}>+{(paperPremium*spec.stemCount).toFixed(2)}</Text></View>}
            <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:4}}><Text style={{fontWeight:'700', fontSize:12}}>Total</Text><Text style={{fontWeight:'700', fontSize:12}}>${totalPrice.toFixed(2)}</Text></View>
          </View>
        </Section>
      ) : papers.length>0 ? (
        <Section title="Papers out of stock">
          <Text style={{color:'#6B4A4A', fontSize:12}}>All uploaded papers are currently out of stock — check back soon or contact the studio.</Text>
        </Section>
      ) : (
        <>
          <Section title="1 · Paper Colour">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {COLORS.map(c => (
                <Chip key={c} label={c} active={spec.paperColor === c} onPress={() => setSpec({ paperColor: c })} />
              ))}
            </View>
          </Section>
          <Section title="2 · Texture & Weight">
            <Text style={{ color: '#6B4A4A', fontSize: 12 }}>Texture — Perth humidity tip: textured holds curl longer</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {TEXTURES.map(t => <Chip key={t} label={t} active={spec.paperTexture === t} onPress={() => setSpec({ paperTexture: t })} />)}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {WEIGHTS.map(w => <Chip key={w} label={w} active={spec.weight === w} onPress={() => setSpec({ weight: w })} />)}
            </View>
          </Section>
        </>
      )}

      {/* Stem count & height */}
      <Section title="3 · Stems & Height">
        <Row label="Stem count">
          <Stepper value={spec.stemCount} min={1} max={25} onChange={(v) => setSpec({ stemCount: v })} />
        </Row>
        <Row label="Height (mm)">
          <Stepper value={spec.heightMm} min={150} max={600} step={50} onChange={(v) => setSpec({ heightMm: v })} />
        </Row>
        <Row label="Add greenery (eucalyptus)">
          <Switch value={spec.addGreenery} onValueChange={(v) => setSpec({ addGreenery: v })} />
        </Row>
        <Row label="Include vase (+$22)">
          <Switch value={spec.vaseIncluded} onValueChange={(v) => setSpec({ vaseIncluded: v })} />
        </Row>
        <Row label="Glass dome (+$45)">
          <Switch value={spec.domeIncluded} onValueChange={(v) => setSpec({ domeIncluded: v })} />
        </Row>
        <Row label="LED lights (+$18)">
          <Switch value={spec.ledIncluded} onValueChange={(v) => setSpec({ ledIncluded: v })} />
        </Row>
      </Section>

      {/* Template */}
      <Section title="4 · Precision Template">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TEMPLATES.map(t => (
            <Chip key={t.id} label={t.label} active={spec.templateId === t.id} onPress={() => setSpec({ templateId: t.id })} />
          ))}
        </View>
        <Pressable onPress={()=> selectedPaper?.imageUrl && setPaperZoom(selectedPaper)} style={{ marginTop: 12, borderRadius: 12, padding: 12, alignItems: 'center', backgroundColor: selectedPaper?.colourHex || '#FDE8E0', borderWidth: 1, borderColor: '#E8CFCF', overflow: 'hidden' }}>
          <Text style={{ color: '#4A2C2A', fontWeight: '700' }}>{TEMPLATES.find(t=>t.id===spec.templateId)?.label} — SVG preview</Text>
          <Text style={{ color: '#4A2C2A', fontSize: 12, marginTop: 4 }}>{selectedPaper ? `${selectedPaper.name} • ${selectedPaper.texture}` : `${spec.paperColor} ${spec.weight} ${spec.paperTexture}`} paper {selectedPaper?.imageUrl ? '• tap to zoom' : ''} {selectedPaper?.texture ? `• ${selectedPaper.texture}` : ''}</Text>
          <View style={{ marginTop: 8, width: '100%', height: 100, borderRadius: 8, backgroundColor: selectedPaper?.imageUrl ? 'white' : '#E8CFCF', borderWidth: 1, borderColor: '#D6A8A8', overflow: 'hidden', position: 'relative' }}>
            {selectedPaper?.imageUrl ? <Image source={{uri: selectedPaper.imageUrl}} style={{position:'absolute', top:0, left:0, right:0, bottom:0, opacity:0.35}} resizeMode="repeat" /> : null}
            {selectedPaper?.texture==='linen' && <View style={{position:'absolute', top:0, left:0, right:0, bottom:0, opacity:0.07, backgroundColor:'transparent', borderWidth:0}} />}
            {selectedPaper?.texture==='pearl' && <View style={{position:'absolute', top:0, left:0, right:0, bottom:0, opacity:0.12, backgroundColor:'rgba(255,255,255,0.5)'}} />}
            <View style={{ flex:1, alignItems:'center', justifyContent:'center', backgroundColor: selectedPaper?.imageUrl ? 'rgba(255,255,255,0.35)' : 'transparent' }}>
              <Text style={{ color: '#4A2C2A', fontWeight:'700' }}>✂ {TEMPLATES.find(t=>t.id===spec.templateId)?.label}</Text>
              <Text style={{ color:'#6B4A4A', fontSize:11, marginTop:2 }}>{selectedPaper ? `${selectedPaper.paperType} ${selectedPaper.weight} • ${selectedPaper.texture}` : `${spec.paperColor} • ${spec.paperTexture} • ${spec.weight}`}</Text>
            </View>
          </View>
        </Pressable>
        {paperZoom && (
          <Pressable onPress={()=> setPaperZoom(null)} style={{ position:'absolute', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.8)', alignItems:'center', justifyContent:'center', padding:20, zIndex:50 }}>
            <View style={{ backgroundColor:'white', borderRadius:16, overflow:'hidden', width:'100%', maxWidth:320 }}>
              <Image source={{uri: paperZoom.imageUrl}} style={{width:'100%', height:320}} resizeMode="contain" />
              <View style={{padding:12}}>
                <Text style={{fontWeight:'700', color:'#4A2C2A'}}>{paperZoom.name}</Text>
                <Text style={{fontSize:12, color:'#6B4A4A', marginTop:2}}>{paperZoom.colour} • {paperZoom.paperType} • {paperZoom.texture} • {paperZoom.weight} • +${Number(paperZoom.pricePremiumPerStem).toFixed(2)}/stem</Text>
                <Pressable onPress={()=> setPaperZoom(null)} style={{marginTop:10, backgroundColor:'#4A2C2A', padding:10, borderRadius:12, alignItems:'center'}}><Text style={{color:'white', fontWeight:'700'}}>Close</Text></Pressable>
              </View>
            </View>
          </Pressable>
        )}
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
