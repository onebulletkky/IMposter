FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /source
COPY global.json Directory.Build.props ./
COPY src/Imposter.Game.Domain/ src/Imposter.Game.Domain/
COPY src/Imposter.Game.Api/ src/Imposter.Game.Api/
RUN dotnet publish src/Imposter.Game.Api/Imposter.Game.Api.csproj -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
USER $APP_UID
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "Imposter.Game.Api.dll"]
