Pod::Spec.new do |s|
  s.name           = 'PulsoWatch'
  s.version        = '0.1.0'
  s.summary        = 'Phone side of the PULSO Apple Watch companion (WatchConnectivity).'
  s.description    = s.summary
  s.license        = 'MIT'
  s.author         = 'PULSO'
  s.homepage       = 'https://pulsofitness.tech'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'WatchConnectivity'

  s.source_files = "**/*.{h,m,swift}"
end
