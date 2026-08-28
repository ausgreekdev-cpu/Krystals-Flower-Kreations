import { useEffect, useState } from 'react';
import { ScrollView, Text, View, Pressable } from 'react-native';

const API = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
export default function Workshops() {
  const [items,setItems]=useState([]);
  useEffect(()=>{ fetch(`${API}/api/workshops`).then(r=>r.json()).then(setItems).catch(()=>{}); }, []);
  return (
    <ScrollView style={{flex:1, backgroundColor:'#FFF7F0'}} contentContainerStyle={{padding:16, gap:12}}>
      <Text style={{fontSize:22, fontWeight:'800', color:'#4A2C2A'}}>Workshops — Perth Studio</Text>
      <Text style={{color:'#6B4A4A'}}>Cricut + origami + armature. Small groups, kits included, take home your bloom.</Text>
      {items.map(w=> (
        <View key={w.id} style={{backgroundColor:'white', borderRadius:16, padding:16, borderWidth:1, borderColor:'#E8CFCF'}}>
          <Text style={{fontWeight:'800', color:'#4A2C2A'}}>{w.title}</Text>
          <Text style={{color:'#6B4A4A', marginTop:4}}>{w.description}</Text>
          <Text style={{color:'#B85C5C', marginTop:8, fontWeight:'700'}}>${Number(w.price).toFixed(2)} • {w.durationMinutes} min • {w.capacity} spots</Text>
          {w.sessions?.map(s=> <Text key={s.id} style={{color:'#6B4A4A', fontSize:12, marginTop:6}}>{new Date(s.startsAt).toLocaleString()} — {s.capacity - s.bookedCount} left</Text>)}
        </View>
      ))}
      {items.length===0 && <Text style={{color:'#6B4A4A'}}>No workshops yet — run `npx prisma db seed`.</Text>}
    </ScrollView>
  );
}
