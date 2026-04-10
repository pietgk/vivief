{
  description = "vivief dev environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "aarch64-darwin"
        "x86_64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forAllSystems =
        f:
        nixpkgs.lib.genAttrs systems (
          system:
          f {
            pkgs = import nixpkgs { inherit system; };
          }
        );
    in
    {
      devShells = forAllSystems (
        { pkgs }:
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              dotnet-sdk_10
              gh
              git
              nodejs_24
              pnpm
              python3
              turbo
            ];

            shellHook = ''
              echo "vivief dev shell — node $(node --version), pnpm $(pnpm --version), python $(python3 --version), dotnet $(dotnet --version)"
            '';
          };
        }
      );
    };
}
