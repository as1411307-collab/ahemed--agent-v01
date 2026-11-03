Pod::Spec.new do |s|
  s.name           = 'EnclaveSigner'
  s.version        = '0.1.0'
  s.summary        = 'Local Secure Enclave signer for Ahmed Agent'
  s.description    = 'Private on-device P-256 signing for authenticated demo review.'
  s.homepage       = 'https://github.com/as1411307-collab/ahemed--agent-v01'
  s.license        = { :type => 'MIT' }
  s.author         = { 'Ahmed Agent' => 'local-module' }
  s.source         = { :git => 'https://github.com/as1411307-collab/ahemed--agent-v01.git' }
  s.platform       = :ios, '15.1'
  s.static_framework = true
  s.source_files   = '**/*.{h,m,mm,swift,hpp,cpp}'
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
