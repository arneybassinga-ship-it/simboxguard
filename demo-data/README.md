Fichiers de test pour le parcours reel :

- `cdr_mtn_demo.csv`
- `cdr_airtel_demo.csv`

Contenu prevu :
- 1 MSISDN tres suspecte par operateur pour tester l'agregation / les analyses
- 2 MSISDN avec contacts communs par operateur pour tester la detection Simbox
- 1 MSISDN normale par operateur pour comparer

Reset des donnees metier avant test :

```bash
cd backend
MYSQL_HOST=127.0.0.1 MYSQL_PORT=3310 npm run reset:demo
```

Puis :

1. connexion agent MTN et import de `demo-data/cdr_mtn_demo.csv`
2. connexion agent Airtel et import de `demo-data/cdr_airtel_demo.csv`
3. aggregation par periode
4. detection Simbox
5. verification cote analyste puis ARPCE
