import { View, Text, Pressable, TextInput } from 'react-native';
import { useState } from 'react';
const API = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
export default function Account(){
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [msg,setMsg]=useState('');
  async function login(){
    const r=await fetch(`${API}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    const j=await r.json(); setMsg(r.ok? `Logged in as ${j.user.name}`: j.error);
  }
  return (
    <View style={{flex:1, backgroundColor:'#FFF7F0', padding:16, gap:12}}>
      <Text style={{fontSize:22, fontWeight:'800', color:'#4A2C2A'}}>Account</Text>
      <TextInput value={email} onChangeText={setEmail} placeholder="email" autoCapitalize="none" style={{backgroundColor:'white', padding:12, borderRadius:12, borderWidth:1, borderColor:'#E8CFCF'}}/>
      <TextInput value={password} onChangeText={setPassword} placeholder="password" secureTextEntry style={{backgroundColor:'white', padding:12, borderRadius:12, borderWidth:1, borderColor:'#E8CFCF'}}/>
      <Pressable onPress={login} style={{backgroundColor:'#B85C5C', padding:14, borderRadius:12, alignItems:'center'}}><Text style={{color:'white', fontWeight:'700'}}>Log in</Text></Pressable>
      <Text style={{color:'#6B4A4A'}}>{msg}</Text>
      <Text style={{color:'#6B4A4A', marginTop:12}}>Seed login: krystal@flowerkreations.com.au / admin123</Text>
    </View>
  );
}
