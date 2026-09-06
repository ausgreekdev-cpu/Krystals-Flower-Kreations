import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View, Pressable, Image } from 'react-native';
const API = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
export default function Product(){
  const { slug }=useLocalSearchParams();
  const [p,setP]=useState(null);
  useEffect(()=>{ fetch(`${API}/api/products/${slug}`).then(r=>r.json()).then(setP).catch(()=>{}); }, [slug]);
  if(!p) return <View style={{flex:1, backgroundColor:'#FFF7F0', alignItems:'center', justifyContent:'center'}}><Text>Loading bloom...</Text></View>;
  return (
    <ScrollView style={{flex:1, backgroundColor:'#FFF7F0'}} contentContainerStyle={{padding:16}}>
      <Image source={{uri: p.images?.[0]?.url || `${API}/placeholder-bloom.jpg`}} style={{height:280, borderRadius:16}}/>
      <Text style={{fontSize:22, fontWeight:'800', color:'#4A2C2A', marginTop:16}}>{p.title}</Text>
      <Text style={{color:'#B85C5C', fontWeight:'700', marginTop:8, fontSize:18}}>${Number(p.price).toFixed(2)} AUD {p.compareAtPrice? `— was $${Number(p.compareAtPrice).toFixed(2)}`:''}</Text>
      <Text style={{color:'#6B4A4A', marginTop:8}}>{p.description}</Text>
      {p.cricutCompatible && <Text style={{marginTop:8, color:'#4A2C2A'}}>✓ Cricut-compatible • {p.paperStock || 'cardstock'}</Text>}
      {p.madeToOrderDays && <Text style={{color:'#6B4A4A', marginTop:4}}>Made to order — {p.madeToOrderDays} days • Perth studio</Text>}
      <Pressable style={{backgroundColor:'#B85C5C', padding:16, borderRadius:12, alignItems:'center', marginTop:16}}><Text style={{color:'white', fontWeight:'800'}}>Add to Cart</Text></Pressable>
      <Text style={{color:'#6B4A4A', marginTop:12, fontSize:12}}>GST inclusive • ABN on invoice • Share to Instagram Story</Text>
    </ScrollView>
  );
}
