FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY global.json Directory.Build.props ./
COPY src/Imposter.Words.Api/Imposter.Words.Api.csproj src/Imposter.Words.Api/
RUN dotnet restore src/Imposter.Words.Api/Imposter.Words.Api.csproj
COPY src/Imposter.Words.Api/ src/Imposter.Words.Api/
RUN dotnet publish src/Imposter.Words.Api/Imposter.Words.Api.csproj --configuration Release --no-restore --output /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "Imposter.Words.Api.dll"]
