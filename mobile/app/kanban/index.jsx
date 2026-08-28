import { ScrollView, Text, View, Pressable } from 'react-native';
import { useEffect, useState } from 'react';
const STATES = ['drafting_proofing','cricut_cutting','hand_folding_assembly','quality_check','dispatched_pickup_ready'];
const LABEL = { drafting_proofing:'Drafting', cricut_cutting:'Cricut', hand_folding_assembly:'Folding', quality_check:'QC', dispatched_pickup_ready:'Ready' };
const API = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
export default function Kanban(){
  const [orders,setOrders]=useState([]);
  useEffect(()=>{ fetch(`${API}/api/custom-orders`, { headers: {} }).then(r=> r.ok? r.json(): []).then(setOrders).catch(()=>{}); }, []);
  return (
    <ScrollView style={{flex:1, backgroundColor:'#FFF7F0'}} contentContainerStyle={{padding:16}}>
      <Text style={{fontWeight:'800', fontSize:18, color:'#4A2C2A'}}>Custom Orders — Kanban</Text>
      <Text style={{color:'#6B4A4A', fontSize:12}}>Drafting/Proofing → Cricut → Folding → QC → Dispatched</Text>
      {STATES.map(s=> (
        <View key={s} style={{marginTop:14, backgroundColor:'white', borderRadius:12, padding:12, borderWidth:1, borderColor:'#E8CFCF'}}>
          <Text style={{fontWeight:'800', color:'#4A2C2A'}}>{LABEL[s]} — {orders.filter(o=>o.state===s).length}</Text>
          {orders.filter(o=>o.state===s).map(o=> (
            <View key={o.id} style={{marginTop:8, borderWidth:1, borderColor:'#FDE8E0', borderRadius:10, padding:8}}>
              <Text style={{fontWeight:'700', color:'#4A2C2A', fontSize:12}}>{o.orderNumber}</Text>
              <Text style={{fontSize:11, color:'#6B4A4A'}}>{o.customerName} • {o.spec?.paperColor} • {o.spec?.stemCount} stems</Text>
              <Text style={{fontSize:11, color:'#B85C5C'}}>${Number(o.totalPrice).toFixed(2)} • {o.estimatedMinutes}m</Text>
            </View>
          ))}
        </View>
      ))}
      {orders.length===0 && <Text style={{color:'#6B4A4A', marginTop:12}}>No custom orders — create one in Configurator (requires auth list).</Text>}
    </ScrollView>
  );
}
