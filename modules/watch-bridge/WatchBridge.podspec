require "json"

Pod::Spec.new do |s|
  s.name           = "WatchBridge"
  s.version        = "0.1.0"
  s.summary        = "Receives session files from Apple Watch via WatchConnectivity"
  s.license        = "MIT"
  s.author         = "ImuaTrak"
  s.homepage       = "https://github.com/kedhead/imuatrak"
  s.platform       = :ios, "15.1"
  s.source         = { :path => "." }
  s.source_files   = "ios/**/*.{m,h}"
  s.frameworks     = "WatchConnectivity"
  s.dependency     "React-Core"
end
